import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { MediaAsset, Prisma } from '../../generated/prisma/client.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { learningCourseFilter } from '../commerce/enrollment.service.js';
import { lockMediaAsset, StorageService } from './storage.service.js';
import { R2StorageProvider } from './r2-storage.provider.js';

const videoSelect = {
    videoAsset: true,
    videoQualities: {
        where: { asset: { status: 'READY', visibility: 'PRIVATE', purpose: 'LESSON_VIDEO' } },
        orderBy: { height: 'asc' },
        select: { height: true, asset: true },
    },
} satisfies Prisma.CourseLessonSelect;

@Injectable()
export class StorageAccessService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly storage: StorageService,
        private readonly provider: R2StorageProvider,
    ) {}

    private async signed(asset?: MediaAsset | null) {
        if (asset?.status !== 'READY' || asset.visibility !== 'PRIVATE') throw new NotFoundException('Media is unavailable.');
        return this.provider.signRead(asset);
    }

    private lessonScope(user: AuthenticatedUser, courseId: string): Prisma.CourseLessonWhereInput {
        if (user.role !== 'ADMIN' && user.role !== 'STUDENT') {
            throw new ForbiddenException('This account does not have access to the requested learning media.');
        }
        return { section: { course: user.role === 'ADMIN' ? { id: courseId } : learningCourseFilter(user.userId, courseId) } };
    }

    private async signedVideo(lesson: Prisma.CourseLessonGetPayload<{ select: typeof videoSelect }>, height?: number) {
        const selected = height == null ? lesson.videoAsset : lesson.videoQualities.find((item) => item.height === height)?.asset;
        return { ...await this.signed(selected), availableQualities: lesson.videoQualities.map((item) => item.height) };
    }

    async lesson(user: AuthenticatedUser, courseId: string, lessonId: string, height?: number) {
        this.provider.requireClient();
        await this.storage.rateLimit(`read:${user.userId}`, 90);
        const lesson = await this.prisma.courseLesson.findFirst({
            where: { id: lessonId, ...this.lessonScope(user, courseId) },
            select: { type: true, documentAsset: true, ...videoSelect },
        });
        if (!lesson) throw new ForbiddenException('This lesson is outside your authorized course.');
        if (lesson.type === 'VIDEO') return this.signedVideo(lesson, height);
        return this.signed(lesson.type === 'PDF' && height == null ? lesson.documentAsset : null);
    }

    async resource(user: AuthenticatedUser, courseId: string, lessonId: string, resourceId: string) {
        this.provider.requireClient();
        await this.storage.rateLimit(`read:${user.userId}`, 90);
        const resource = await this.prisma.lessonResource.findFirst({
            where: { id: resourceId, lesson: { id: lessonId, ...this.lessonScope(user, courseId) } },
            select: { mediaAsset: true },
        });
        if (!resource) throw new ForbiddenException('This resource is outside your authorized lesson.');
        return this.signed(resource.mediaAsset);
    }

    async preview(ipKey: string, courseId: string, lessonId: string, height?: number) {
        this.provider.requireClient();
        await this.storage.rateLimit(`preview:${ipKey}`, 20);
        const lesson = await this.prisma.courseLesson.findFirst({
            where: {
                id: lessonId, isPreview: true, type: 'VIDEO',
                section: { course: { id: courseId, status: 'PUBLISHED', category: { status: 'ACTIVE' }, instructor: { status: 'ACTIVE', role: 'INSTRUCTOR' } } },
            },
            select: videoSelect,
        });
        if (!lesson) throw new NotFoundException('Media is unavailable.');
        return this.signedVideo(lesson, height);
    }

    async adminRead(userId: string, id: string) {
        await this.storage.rateLimit(`read:${userId}`, 90);
        const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
        if (asset?.status === 'READY' && asset.publicUrl) return { url: asset.publicUrl, expiresAt: null };
        return this.signed(asset);
    }

    async updateAvatar(userId: string, value?: string | null, assetId?: string | null) {
        return this.prisma.$transaction(async (tx) => {
            let avatar: string | null = null;
            if (assetId) {
                const asset = await lockMediaAsset(tx, assetId);
                if (!asset || asset.status !== 'READY' || asset.purpose !== 'USER_AVATAR' ||
                    asset.uploadedById !== userId || !asset.publicUrl) throw new BadRequestException('Select your own verified avatar upload.');
                avatar = asset.publicUrl;
            } else if (value?.trim()) {
                let url: URL;
                try { url = new URL(value); } catch { throw new BadRequestException('Enter a valid HTTPS image URL.'); }
                if (url.protocol !== 'https:' || url.username || url.password ||
                    [...url.searchParams.keys()].some((key) => key.toLowerCase().startsWith('x-amz-'))) {
                    throw new BadRequestException('Enter a valid public HTTPS image URL.');
                }
                url.hash = '';
                const clean = new URL(url);
                clean.search = '';
                const stored = await tx.mediaAsset.findUnique({ where: { publicUrl: clean.href }, select: { id: true } });
                if (stored) throw new BadRequestException('Select your verified avatar upload instead of pasting a managed URL.');
                avatar = url.href;
            }
            await tx.user.update({ where: { id: userId }, data: { avatar } });
            return avatar;
        });
    }
}
