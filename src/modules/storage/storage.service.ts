import { randomUUID } from 'node:crypto';
import {
    BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus,
    Injectable, NotFoundException,
} from '@nestjs/common';
import type { PaginationInput } from '../../common/pagination/pagination.input.js';
import { createPaginationMeta, getPaginationWindow } from '../../common/pagination/pagination.utils.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma, type MediaAsset } from '../../generated/prisma/client.js';
import type { MediaPurpose } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { canEditCourse } from '../courses/course-lifecycle.js';
import { checkUpload, matchesFileSignature, mediaPolicy } from './media-policy.js';
import { R2StorageProvider } from './r2-storage.provider.js';
import type { AdminMediaFilter, CompleteMediaPart, CreateMediaUploadInput, MediaSelectionField, MediaSelectionFilter } from './storage.models.js';

const gracePeriod = 7 * 24 * 3600 * 1000;
const stagingGrace = 60 * 60 * 1000;
const storageQuotaLock = 743291647386n;
const transactionOptions = { timeout: 45000 };

type Reference = { assetId: string; entityType: string; entityId: string };

export async function lockMediaAsset(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT "id" FROM "media_assets" WHERE "id" = ${id}::uuid FOR UPDATE`;
    return tx.mediaAsset.findUnique({ where: { id } });
}

export async function privateAssetForAttachment(
    tx: Prisma.TransactionClient, id: string, userId: string, courseId: string, purpose: MediaPurpose,
) {
    const asset = await lockMediaAsset(tx, id);
    if (!asset || asset.status !== 'READY' || asset.visibility !== 'PRIVATE' || asset.purpose !== purpose ||
        asset.uploadedById !== userId || asset.courseScopeId !== courseId) {
        throw new BadRequestException('Choose a verified upload for this course and field.');
    }
    return asset;
}

export function visibleAsset(asset: MediaAsset) {
    return { ...asset, publicUrl: asset.status === 'READY' ? asset.publicUrl : null };
}

@Injectable()
export class StorageService {
    constructor(private readonly prisma: PrismaService, readonly provider: R2StorageProvider) {}

    options(purpose: MediaPurpose) {
        const config = this.provider.config;
        const { limit, files } = mediaPolicy(purpose, config);
        return { enabled: config.enabled, maxBytes: limit, extensions: Object.keys(files),
            formats: Object.entries(files).map(([extension, mimeType]) => ({ extension, mimeType })) };
    }

    async rateLimit(key: string, limit: number) {
        const now = new Date();
        const cutoff = new Date(now.getTime() - 60000);
        const rows = await this.prisma.$queryRaw<{ requests: number }[]>`
            INSERT INTO "media_request_limits" ("key", "windowStart", "requests") VALUES (${key}, ${now}, 1)
            ON CONFLICT ("key") DO UPDATE
            SET "windowStart" = CASE WHEN "media_request_limits"."windowStart" <= ${cutoff} THEN ${now} ELSE "media_request_limits"."windowStart" END,
                "requests" = CASE WHEN "media_request_limits"."windowStart" <= ${cutoff} THEN 1 ELSE "media_request_limits"."requests" + 1 END
            WHERE "media_request_limits"."windowStart" <= ${cutoff} OR "media_request_limits"."requests" < ${limit}
            RETURNING "requests"
        `;
        if (!rows.length) throw new HttpException('Too many media requests. Try again in a minute.', HttpStatus.TOO_MANY_REQUESTS);
    }

    private async authorizeField(user: AuthenticatedUser, input: Pick<CreateMediaUploadInput, 'purpose' | 'courseId'>) {
        if (input.purpose === 'USER_AVATAR') {
            if (input.courseId) throw new BadRequestException('An avatar does not belong to a course.');
            return;
        }
        const courseMedia = input.purpose.startsWith('COURSE_') || input.purpose.startsWith('LESSON_');
        if (user.role !== 'ADMIN' && (user.role !== 'INSTRUCTOR' || !courseMedia)) {
            throw new ForbiddenException('You cannot upload media for this field.');
        }
        if (input.purpose.startsWith('LESSON_') && !input.courseId) {
            throw new BadRequestException('Select the course for this upload.');
        }
        if (input.courseId) {
            const course = await this.prisma.course.findUnique({
                where: { id: input.courseId, ...(user.role === 'INSTRUCTOR' ? { instructorId: user.userId } : {}) },
                select: { status: true },
            });
            if (!course) throw new NotFoundException('Course not found.');
            if (!canEditCourse(course.status)) throw new ConflictException('This course is locked for editing.');
        }
    }

    private async selectionWhere(user: AuthenticatedUser, field: MediaSelectionField): Promise<Prisma.MediaAssetWhereInput> {
        await this.authorizeField(user, field);
        const policy = mediaPolicy(field.purpose, this.provider.config);
        const isPrivate = policy.visibility === 'PRIVATE';
        const ownerOnly = isPrivate || field.purpose === 'USER_AVATAR' || user.role !== 'ADMIN';
        return {
            purpose: field.purpose,
            status: 'READY',
            visibility: policy.visibility,
            sizeBytes: { gt: 0, lte: policy.limit },
            uploadedById: ownerOnly ? user.userId : undefined,
            publicUrl: isPrivate ? null : { not: null },
            AND: [
                { OR: Object.entries(policy.files).map(([extension, mimeType]) => ({ extension, mimeType })) },
                isPrivate ? { courseScopeId: field.courseId }
                    : { OR: [{ courseScopeId: null }, ...(field.courseId ? [{ courseScopeId: field.courseId }] : [])] },
            ],
        };
    }

    async selection(user: AuthenticatedUser, pagination: PaginationInput, filter: MediaSelectionFilter) {
        const scope = await this.selectionWhere(user, filter);
        await this.rateLimit(`selection:${user.userId}`, 90);
        const { page, limit, skip } = getPaginationWindow(pagination);
        const search = filter.search?.trim();
        const where: Prisma.MediaAssetWhereInput = {
            ...scope,
            extension: filter.extension,
            originalFileName: search ? { contains: search, mode: 'insensitive' } : undefined,
        };
        const [items, total] = await this.prisma.$transaction([
            this.prisma.mediaAsset.findMany({ where, skip, take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
            this.prisma.mediaAsset.count({ where }),
        ]);
        return { items: items.map(visibleAsset), meta: createPaginationMeta(page, limit, total) };
    }

    async selectedAsset(user: AuthenticatedUser, field: MediaSelectionField, id: string) {
        const where = await this.selectionWhere(user, field);
        await this.rateLimit(`selection-read:${user.userId}`, 90);
        const asset = await this.prisma.mediaAsset.findFirst({ where: { ...where, id } });
        if (!asset) throw new NotFoundException('This file is unavailable for the selected field.');
        return asset;
    }

    async create(user: AuthenticatedUser, input: CreateMediaUploadInput) {
        this.provider.requireClient();
        await this.authorizeField(user, input);
        await this.rateLimit(`write:${user.userId}`, 30);
        const config = this.provider.config;
        const file = checkUpload(input.purpose, input.fileName, input.mimeType, input.sizeBytes, config);

        const reservation = await this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(${storageQuotaLock})`;
            const existing = await tx.mediaAsset.findUnique({ where: { uploadedById_requestId: { uploadedById: user.userId, requestId: input.requestId } } });
            if (existing) {
                if (existing.purpose !== input.purpose || existing.sizeBytes !== input.sizeBytes || existing.originalFileName !== file.name ||
                    existing.mimeType !== file.mimeType || existing.courseScopeId !== (input.courseId ?? null)) {
                    throw new ConflictException('This upload request already belongs to another file.');
                }
                return existing;
            }
            const usage = await this.reservedBytes(tx);
            if (usage + input.sizeBytes * 2 > config.hardLimit) {
                throw new ConflictException('There is not enough reserved storage for this file. Contact an administrator.');
            }
            const id = randomUUID();
            const scope = input.courseId ? `courses/${input.courseId}` : `accounts/${user.userId}`;
            const objectKey = `${config.namespace}/${scope}/${input.purpose.toLowerCase().replaceAll('_', '-')}/${id}.${file.extension}`;
            const publicAsset = file.visibility === 'PUBLIC';
            return tx.mediaAsset.create({ data: {
                id, requestId: input.requestId, uploadedById: user.userId, courseScopeId: input.courseId,
                bucket: publicAsset ? config.publicBucket : config.privateBucket, stagingBucket: config.privateBucket, objectKey,
                publicUrl: publicAsset ? `${config.publicOrigin}/${objectKey}` : null,
                originalFileName: file.name, mimeType: file.mimeType, extension: file.extension, sizeBytes: input.sizeBytes,
                purpose: input.purpose, visibility: file.visibility,
                partSize: input.sizeBytes >= config.multipartThreshold ? config.partSize : null,
                expiresAt: new Date(Date.now() + config.uploadExpiry * 1000),
            } });
        });
        return this.prisma.$transaction(async (tx) => {
            let asset = await this.owned(tx, user.userId, reservation.id);
            if (asset.status === 'READY') return { asset: visibleAsset(asset), expiresAt: asset.expiresAt };
            const expiresIn = this.pendingSeconds(asset);
            if (asset.partSize && !asset.multipartId) {
                const multipartId = await this.provider.startMultipart(asset);
                asset = await tx.mediaAsset.update({ where: { id: asset.id }, data: { multipartId } });
            }
            const url = asset.partSize ? null : await this.provider.signPut(asset, expiresIn);
            return { asset: visibleAsset(asset), expiresAt: asset.expiresAt, url, partSize: asset.partSize };
        }, transactionOptions);
    }

    async signParts(userId: string, id: string, partNumbers: number[]) {
        this.provider.requireClient();
        return this.prisma.$transaction(async (tx) => {
            const asset = await this.owned(tx, userId, id);
            const expiresIn = this.pendingSeconds(asset);
            const partSize = asset.partSize;
            if (!partSize || !asset.multipartId) throw new ConflictException('This is not a multipart upload.');
            const count = Math.ceil(asset.sizeBytes / partSize);
            if (!partNumbers.length || new Set(partNumbers).size !== partNumbers.length || partNumbers.some((part) => part > count || part < 1)) {
                throw new BadRequestException('Invalid upload part numbers.');
            }
            return Promise.all(partNumbers.map(async (partNumber) => {
                const size = Math.min(partSize, asset.sizeBytes - (partNumber - 1) * partSize);
                return { partNumber, url: await this.provider.signPart(asset, partNumber, size, expiresIn) };
            }));
        });
    }

    async complete(userId: string, id: string, parts?: CompleteMediaPart[]) {
        this.provider.requireClient();
        const completed = await this.prisma.$transaction(async (tx) => {
            const asset = await this.owned(tx, userId, id);
            if (asset.status === 'READY') return asset;
            this.pendingSeconds(asset);
            let object = await this.provider.inspect(asset);
            if (!object && asset.partSize) {
                const ordered = [...(parts ?? [])].sort((left, right) => left.partNumber - right.partNumber);
                if (!asset.multipartId || ordered.length !== Math.ceil(asset.sizeBytes / asset.partSize) ||
                    ordered.some((part, index) => part.partNumber !== index + 1 || !/^(?:"[a-f0-9]{32}"|[a-f0-9]{32})$/i.test(part.etag))) {
                    throw new BadRequestException('Upload all parts before completing the file.');
                }
                await this.provider.completeParts(asset, ordered.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })));
                object = await this.provider.inspect(asset);
            }
            if (!object) throw new ConflictException('The uploaded file is not available for verification yet.');
            if (!object.ETag || object.ContentLength !== asset.sizeBytes || object.ContentType !== asset.mimeType ||
                !matchesFileSignature(asset.extension, await this.provider.sample(asset, object.ETag))) {
                return tx.mediaAsset.update({ where: { id }, data: { status: 'FAILED' } });
            }
            await this.provider.publish(asset, object.ETag);
            return tx.mediaAsset.update({ where: { id }, data: { status: 'READY', uploadedAt: new Date() } });
        }, transactionOptions);
        if (completed.status === 'FAILED') throw new BadRequestException('The uploaded file size or format did not match the selected file.');
        return visibleAsset(completed);
    }

    async abort(userId: string, id: string) {
        this.provider.requireClient();
        return this.prisma.$transaction(async (tx) => {
            const asset = await this.owned(tx, userId, id);
            if (asset.status !== 'PENDING') return asset.status === 'ABORTED' || asset.status === 'FAILED';
            if (asset.multipartId) {
                await this.provider.clearStaging(asset);
            }
            await tx.mediaAsset.update({ where: { id }, data: {
                status: 'ABORTED', stagingPending: !asset.multipartId,
            } });
            return true;
        }, transactionOptions);
    }

    private async owned(tx: Prisma.TransactionClient, userId: string, id: string) {
        const asset = await lockMediaAsset(tx, id);
        if (!asset || asset.uploadedById !== userId) throw new NotFoundException('Upload not found.');
        return asset;
    }

    private pendingSeconds(asset: MediaAsset) {
        const seconds = Math.floor((asset.expiresAt.getTime() - Date.now()) / 1000);
        if (asset.status !== 'PENDING' || seconds < 1) throw new ConflictException('Upload is no longer open. Start a new upload.');
        return seconds;
    }

    private async reservedBytes(tx: Prisma.TransactionClient) {
        const [usage] = await tx.$queryRaw<{ bytes: bigint }[]>`
            SELECT COALESCE(SUM("sizeBytes"::bigint * (
                CASE WHEN status IN ('PENDING','READY','DELETING') THEN 1 ELSE 0 END
                + CASE WHEN "stagingPending" THEN 1 ELSE 0 END
            )),0)::bigint AS bytes FROM "media_assets"
        `;
        return Number(usage.bytes);
    }

    private async references(tx: Prisma.TransactionClient, ids: string[]) {
        return ids.length ? tx.$queryRaw<Reference[]>`
            SELECT "assetId", "entityType", "entityId" FROM media_asset_references
            WHERE "assetId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
        ` : [];
    }

    async list(pagination: PaginationInput, filter?: AdminMediaFilter, oldestFirst = false, ownerId?: string) {
        const { page, limit, skip } = getPaginationWindow(pagination);
        const where: Prisma.MediaAssetWhereInput = {
            status: filter?.status ?? { not: 'DELETED' }, purpose: filter?.purpose, visibility: filter?.visibility,
            originalFileName: filter?.search?.trim() ? { contains: filter.search.trim(), mode: 'insensitive' } : undefined,
            createdAt: { gte: filter?.from ? new Date(filter.from) : undefined, lte: filter?.to ? new Date(filter.to) : undefined },
            mimeType: filter?.fileType === 'document' ? { not: { startsWith: 'image/' } } : filter?.fileType ? { startsWith: `${filter.fileType}/` } : undefined,
            ...(filter?.fileType === 'document' ? { NOT: { mimeType: { startsWith: 'video/' } } } : {}),
        };
        const direction = oldestFirst ? 'asc' : 'desc';
        return this.prisma.$transaction(async (tx) => {
            if (ownerId) {
                const courses = await tx.course.findMany({ where: { instructorId: ownerId }, select: { id: true } });
                where.uploadedById = ownerId;
                where.OR = [{ courseScopeId: null }, { courseScopeId: { in: courses.map(({ id }) => id) } }];
                where.AND = [{ purpose: { in: ['COURSE_THUMBNAIL', 'COURSE_PROMOTIONAL_VIDEO', 'LESSON_VIDEO', 'LESSON_DOCUMENT', 'LESSON_RESOURCE'] } }];
            }
            const assets = await tx.mediaAsset.findMany({ where, skip, take: limit, orderBy: [{ createdAt: direction }, { id: direction }],
                include: { uploadedBy: { select: { name: true } } } });
            const refs = await this.references(tx, assets.map(({ id }) => id));
            const total = await tx.mediaAsset.count({ where });
            return {
                items: assets.map((asset) => {
                    const attachments = refs.filter((ref) => ref.assetId === asset.id);
                    return { ...visibleAsset(asset), uploader: asset.uploadedBy?.name ?? null,
                        inUse: attachments.length > 0, attachments: ownerId ? [] : attachments };
                }),
                meta: createPaginationMeta(page, limit, total),
            };
        });
    }

    async stats() {
        const config = this.provider.config;
        const [totals] = await this.prisma.$queryRaw<{
            stored: number; storedBytes: bigint; publicBytes: bigint; privateBytes: bigint;
            images: number; videos: number; documents: number; pending: number; failed: number; unattached: number;
        }[]>`
            SELECT
                count(*) FILTER (WHERE status = 'READY')::int AS stored,
                COALESCE(sum("sizeBytes") FILTER (WHERE status = 'READY'),0) AS "storedBytes",
                COALESCE(sum("sizeBytes") FILTER (WHERE status = 'READY' AND visibility = 'PUBLIC'),0) AS "publicBytes",
                COALESCE(sum("sizeBytes") FILTER (WHERE status = 'READY' AND visibility = 'PRIVATE'),0) AS "privateBytes",
                count(*) FILTER (WHERE status = 'READY' AND "mimeType" LIKE 'image/%')::int AS images,
                count(*) FILTER (WHERE status = 'READY' AND "mimeType" LIKE 'video/%')::int AS videos,
                count(*) FILTER (WHERE status = 'READY' AND "mimeType" NOT LIKE 'image/%' AND "mimeType" NOT LIKE 'video/%')::int AS documents,
                count(*) FILTER (WHERE status = 'PENDING')::int AS pending,
                count(*) FILTER (WHERE status = 'FAILED')::int AS failed,
                count(*) FILTER (WHERE status = 'READY' AND NOT EXISTS (
                    SELECT 1 FROM media_asset_references r WHERE r."assetId" = a.id
                ))::int AS unattached
            FROM "media_assets" a
        `;
        return {
            ...totals, storedBytes: Number(totals.storedBytes), publicBytes: Number(totals.publicBytes), privateBytes: Number(totals.privateBytes),
            reservedBytes: await this.reservedBytes(this.prisma), enabled: config.enabled, softLimit: config.softLimit, hardLimit: config.hardLimit,
        };
    }

    async assertInstructorAsset(
        database: Prisma.TransactionClient, asset: MediaAsset | null, ownerId: string,
    ): Promise<MediaAsset> {
        if (!asset || asset.uploadedById !== ownerId ||
            (!asset.purpose.startsWith('COURSE_') && !asset.purpose.startsWith('LESSON_'))) {
            throw new NotFoundException('Media not found.');
        }
        if (asset.courseScopeId && !await database.course.findUnique({
            where: { id: asset.courseScopeId, instructorId: ownerId }, select: { id: true },
        })) throw new NotFoundException('Media not found.');
        return asset;
    }

    async deleteUnused(id: string, olderThan?: Date, ownerId?: string) {
        this.provider.requireClient();
        const staged = await this.prisma.$transaction(async (tx) => {
            const asset = await lockMediaAsset(tx, id);
            if (ownerId) await this.assertInstructorAsset(tx, asset, ownerId);
            if (!asset) throw new NotFoundException('Media not found.');
            if (asset.status === 'DELETED') return null;
            if (!['READY', 'DELETING'].includes(asset.status)) throw new ConflictException('Media must finish uploading before deletion.');
            if ((await this.references(tx, [id])).length) {
                throw new ConflictException('This media is still in use.');
            }
            if (olderThan && asset.status !== 'DELETING' && asset.updatedAt > olderThan) return null;
            return tx.mediaAsset.update({ where: { id }, data: { status: 'DELETING' } });
        });
        if (staged) {
            await this.provider.deleteFinal(staged);
            await this.prisma.mediaAsset.update({ where: { id }, data: { status: 'DELETED', deletedAt: new Date() } });
        }
        return true;
    }

    async cleanup() {
        this.provider.requireClient();
        const expired = new Date(Date.now() - stagingGrace);
        const orphanCutoff = new Date(Date.now() - gracePeriod);
        const staging = await this.prisma.mediaAsset.findMany({
            where: { stagingPending: true, expiresAt: { lt: expired } }, orderBy: { expiresAt: 'asc' }, take: 10,
        });
        for (const { id } of staging) {
            await this.prisma.$transaction(async (tx) => {
                const asset = await lockMediaAsset(tx, id);
                if (!asset?.stagingPending || asset.expiresAt >= expired) return;
                await this.provider.clearStaging(asset);
                if (['PENDING', 'FAILED', 'ABORTED'].includes(asset.status)) await this.provider.deleteFinal(asset);
                await tx.mediaAsset.update({ where: { id }, data: {
                    stagingPending: false, status: asset.status === 'PENDING' ? 'ABORTED' : asset.status,
                    updatedAt: asset.updatedAt,
                } });
            }, transactionOptions);
        }
        const unused = await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM media_assets a
            WHERE (status = 'DELETING' OR (status = 'READY' AND "updatedAt" < ${orphanCutoff}))
            AND NOT EXISTS (SELECT 1 FROM media_asset_references r WHERE r."assetId" = a.id)
            ORDER BY "updatedAt" LIMIT 10
        `;
        for (const { id } of unused) await this.deleteUnused(id, orphanCutoff);
        await this.prisma.mediaRequestLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 86400000) } } });
        return staging.length + unused.length;
    }
}
