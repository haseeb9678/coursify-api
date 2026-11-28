import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { CourseReviewsService } from '../course-reviews/course-reviews.service.js';
import { CoursesService } from '../courses/courses.service.js';
import { CurriculumService } from '../curriculum/curriculum.service.js';
import { R2StorageProvider } from './r2-storage.provider.js';
import { StorageAccessService } from './storage-access.service.js';
import type { CreateMediaUploadInput } from './storage.models.js';
import { StorageService } from './storage.service.js';

const database = process.env.COMMERCE_TEST_DATABASE_URL;
const isolated = database && /^postgres(?:ql)?:\/\/[^@/]+@(?:localhost|127\.0\.0\.1):\d+\/coursify_commerce_test$/.test(database);
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const mp4 = Buffer.from('00000018667479706d70343200000000', 'hex');

describe.runIf(Boolean(isolated))('storage with PostgreSQL coordination and a fixture provider', () => {
    let prisma: PrismaService;
    let provider: R2StorageProvider;
    let storage: StorageService;
    let access: StorageAccessService;
    let curriculum: CurriculumService;
    let admin: AuthenticatedUser;
    let student: AuthenticatedUser;
    let instructor: AuthenticatedUser;
    let categoryId: string;
    let courseId: string;
    let sectionId: string;
    let checkedSize: number;
    let checkedType: string;
    let bytes: Uint8Array;

    async function user(role: AuthenticatedUser['role']): Promise<AuthenticatedUser> {
        const result = await prisma.user.create({
            data: { name: 'Media fixture', email: `${randomUUID()}@fixture.example`, passwordHash: 'unused', role, status: 'ACTIVE' },
        });
        return { userId: result.id, sessionId: randomUUID(), role };
    }

    beforeAll(() => {
        if (!database || !isolated) throw new Error('A disposable loopback PostgreSQL database is required.');
        prisma = new PrismaService(new ConfigService({ database: { url: database } }));
    });
    afterAll(async () => { await prisma?.$disconnect(); });

    beforeEach(async () => {
        vi.restoreAllMocks();
        admin = await user('ADMIN');
        student = await user('STUDENT');
        instructor = await user('INSTRUCTOR');
        categoryId = (await prisma.category.create({
            data: { name: 'Media fixtures', description: 'Fixture category', slug: randomUUID(), iconName: 'Code2', iconColor: '#333333', iconBackground: '#ffffff' },
        })).id;
        const course = await prisma.course.create({
            data: {
                title: 'Media fixture course', slug: randomUUID(), categoryId, instructorId: instructor.userId, createdById: admin.userId,
                sections: { create: { title: 'Module', position: 0 } },
            },
            include: { sections: true },
        });
        courseId = course.id;
        sectionId = course.sections[0].id;
        checkedSize = png.length;
        checkedType = 'image/png';
        bytes = png;
        provider = new R2StorageProvider(new ConfigService({
            STORAGE_ENABLED: 'true', R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'b'.repeat(32),
            R2_SECRET_ACCESS_KEY: 'c'.repeat(64), R2_PUBLIC_URL: 'https://public.fixture.example',
        }));
        vi.spyOn(provider, 'signPut').mockResolvedValue('https://private.fixture.example/upload');
        vi.spyOn(provider, 'inspect').mockImplementation(async () => ({ ETag: '"fixture"', ContentType: checkedType, ContentLength: checkedSize, $metadata: {} }));
        vi.spyOn(provider, 'sample').mockImplementation(async () => bytes);
        vi.spyOn(provider, 'publish').mockResolvedValue(undefined);
        vi.spyOn(provider, 'startMultipart').mockResolvedValue('fixture-multipart');
        vi.spyOn(provider, 'signPart').mockResolvedValue('https://private.fixture.example/part');
        vi.spyOn(provider, 'completeParts').mockResolvedValue(undefined);
        vi.spyOn(provider, 'clearStaging').mockResolvedValue(undefined);
        vi.spyOn(provider, 'deleteFinal').mockResolvedValue(undefined);
        vi.spyOn(provider, 'signRead').mockResolvedValue({ url: 'https://private.fixture.example/read', expiresAt: new Date() });
        storage = new StorageService(prisma, provider);
        access = new StorageAccessService(prisma, storage, provider);
        curriculum = new CurriculumService(prisma);
    });

    function input(change: Partial<CreateMediaUploadInput> = {}): CreateMediaUploadInput {
        return { requestId: randomUUID(), purpose: 'CATEGORY_IMAGE', fileName: 'image.png', mimeType: 'image/png', sizeBytes: png.length, ...change };
    }

    it('reuses authorizations and verifies a file once, without exposing staged media', async () => {
        const request = input();
        await expect(storage.create(student, request)).rejects.toThrow('cannot upload');
        const reservation = await storage.create(admin, request);
        expect(reservation.asset).toMatchObject({ status: 'PENDING', publicUrl: null, visibility: 'PUBLIC', stagingBucket: 'coursify-private' });
        expect((await storage.create(admin, request)).asset.id).toBe(reservation.asset.id);
        await expect(storage.complete(student.userId, reservation.asset.id)).rejects.toThrow('Upload not found');
        const [first, second] = await Promise.all([
            storage.complete(admin.userId, reservation.asset.id), storage.complete(admin.userId, reservation.asset.id),
        ]);
        expect(first.publicUrl).toMatch(/^https:\/\/public\.fixture\.example\//);
        expect(second.id).toBe(first.id);
        expect(provider.publish).toHaveBeenCalledTimes(1);
    });

    it('limits reusable media to the authenticated field, owner, file type and course', async () => {
        const page = { page: 1, limit: 12 };
        const avatarField = { purpose: 'USER_AVATAR' as const };
        const mine = await storage.create(student, input({ ...avatarField, fileName: 'portrait.png' }));
        const other = await storage.create(instructor, input({ ...avatarField, fileName: 'other-portrait.png' }));
        await storage.complete(student.userId, mine.asset.id);
        await storage.complete(instructor.userId, other.asset.id);
        const result = await storage.selection(student, page, { ...avatarField, search: 'portrait', extension: 'png' });
        expect(result.items.map(({ id }) => id)).toEqual([mine.asset.id]);
        expect((await storage.selection(student, page, { ...avatarField, extension: 'jpg' })).items).toEqual([]);
        await expect(access.selectionPreview(student, avatarField, other.asset.id)).rejects.toThrow('unavailable');
        await expect(storage.selection(student, page, { purpose: 'CATEGORY_IMAGE' })).rejects.toThrow('cannot upload');

        const lessonField = { purpose: 'LESSON_VIDEO' as const, courseId };
        checkedSize = mp4.length;
        checkedType = 'video/mp4';
        bytes = mp4;
        const reserved = await storage.create(instructor, input({ ...lessonField, fileName: 'lesson.mp4', mimeType: checkedType, sizeBytes: checkedSize }));
        await storage.complete(instructor.userId, reserved.asset.id);
        expect((await storage.selection(instructor, page, lessonField)).items).toMatchObject([{ id: reserved.asset.id, publicUrl: null }]);
        await expect(access.selectionPreview(instructor, { ...lessonField, purpose: 'LESSON_DOCUMENT' }, reserved.asset.id)).rejects.toThrow('unavailable');
        await expect(access.selectionPreview(student, lessonField, reserved.asset.id)).rejects.toThrow('cannot upload');
        await expect(access.selectionPreview(admin, lessonField, reserved.asset.id)).rejects.toThrow('unavailable');
        await expect(access.selectionPreview(instructor, lessonField, reserved.asset.id)).resolves.toMatchObject({ url: 'https://private.fixture.example/read' });
        expect(await prisma.mediaAsset.count({ where: { id: reserved.asset.id } })).toBe(1);
    });

    it('keeps the hard quota atomic across simultaneous upload reservations', async () => {
        const { reservedBytes } = await storage.stats();
        provider.config.hardLimit = reservedBytes + png.length * 3;
        const results = await Promise.allSettled([storage.create(admin, input()), storage.create(admin, input())]);
        expect(results.map(({ status }) => status).sort()).toEqual(['fulfilled', 'rejected']);
    });

    it('keeps an invalid file quarantined and safely cleans its expired reservation', async () => {
        const reservation = await storage.create(admin, input());
        checkedSize++;
        await expect(storage.complete(admin.userId, reservation.asset.id)).rejects.toThrow('did not match');
        expect(provider.publish).not.toHaveBeenCalled();
        await prisma.mediaAsset.update({ where: { id: reservation.asset.id }, data: { expiresAt: new Date('2026-01-01') } });
        await storage.cleanup();
        expect(await prisma.mediaAsset.findUnique({ where: { id: reservation.asset.id } })).toMatchObject({ status: 'FAILED', stagingPending: false });
        expect(provider.clearStaging).toHaveBeenCalled();
    });

    it('signs multipart lengths, requires complete part lists, and cancels only the owner upload', async () => {
        provider.config.multipartThreshold = 10;
        provider.config.partSize = 10;
        checkedType = 'video/mp4';
        checkedSize = 25;
        bytes = mp4;
        const request = input({ purpose: 'LESSON_VIDEO', fileName: 'lesson.mp4', mimeType: 'video/mp4', sizeBytes: 25, courseId });
        const reservation = await storage.create(admin, request);
        expect(reservation.partSize).toBe(10);
        expect(provider.startMultipart).toHaveBeenCalledTimes(1);
        await expect(storage.signParts(student.userId, reservation.asset.id, [3])).rejects.toThrow('Upload not found');
        await storage.signParts(admin.userId, reservation.asset.id, [3]);
        expect(provider.signPart).toHaveBeenCalledWith(expect.anything(), 3, 5, expect.any(Number));
        vi.mocked(provider.inspect).mockResolvedValueOnce(null);
        await expect(storage.complete(admin.userId, reservation.asset.id, [])).rejects.toThrow('Upload all parts');
        vi.mocked(provider.inspect).mockResolvedValueOnce(null);
        const parts = [1, 2, 3].map((partNumber) => ({ partNumber, etag: 'a'.repeat(32) }));
        await expect(storage.complete(admin.userId, reservation.asset.id, parts)).resolves.toMatchObject({ status: 'READY', publicUrl: null });
        expect(provider.completeParts).toHaveBeenCalledTimes(1);
        const second = await storage.create(admin, { ...request, requestId: randomUUID() });
        await expect(storage.abort(student.userId, second.asset.id)).rejects.toThrow('Upload not found');
        await expect(storage.abort(admin.userId, second.asset.id)).resolves.toBe(true);
        expect(provider.clearStaging).toHaveBeenCalledTimes(1);
    });

    it('accepts uploaded and legacy lesson media through review and checks private and public preview access', async () => {
        const legacy = await prisma.courseLesson.create({
            data: { sectionId, title: 'Legacy', type: 'VIDEO', position: 0, videoUrl: 'https://youtube.example/lesson', durationSeconds: 60 },
        });
        await expect(curriculum.updateLesson({ id: legacy.id, title: 'Updated title' }, admin))
            .resolves.toMatchObject({ videoUrl: legacy.videoUrl });
        await expect(curriculum.createLesson({ sectionId, type: 'VIDEO', title: 'External video', isPreview: true,
            videoUrl: 'https://example.test/video.mp4' }, admin)).rejects.toThrow('directly from your device');
        checkedType = 'video/mp4';
        checkedSize = mp4.length;
        bytes = mp4;
        const reservation = await storage.create(admin, input({ purpose: 'LESSON_VIDEO', fileName: 'lesson.mp4', mimeType: 'video/mp4', sizeBytes: mp4.length, courseId }));
        const asset = await storage.complete(admin.userId, reservation.asset.id);
        await expect(curriculum.saveLesson({
            id: legacy.id, sectionId, title: 'Updated title', type: 'VIDEO', isPreview: false, mediaAssetId: asset.id,
            resources: [{ title: 'Invalid link', type: 'LINK', url: 'https://person@example.test/file' }],
        }, admin)).rejects.toThrow('public HTTPS link');
        expect(await prisma.courseLesson.findUnique({ where: { id: legacy.id } })).toMatchObject({ videoUrl: legacy.videoUrl, videoAssetId: null });
        const lesson = await curriculum.createLesson({
            sectionId, type: 'VIDEO', title: 'Verified lesson', isPreview: false, mediaAssetId: asset.id,
        }, admin);
        expect(lesson).toMatchObject({ videoAssetId: asset.id, videoUrl: null });
        await expect(storage.deleteUnused(asset.id)).rejects.toThrow('still in use');
        await expect(access.lesson(student, courseId, lesson.id)).rejects.toThrow('outside');
        const lowerQuality = await storage.create(admin, input({
            purpose: 'LESSON_VIDEO', fileName: 'lesson-360p.mp4', mimeType: checkedType, sizeBytes: checkedSize, courseId,
        }));
        await storage.complete(admin.userId, lowerQuality.asset.id);
        await curriculum.saveLesson({
            id: lesson.id, sectionId, title: lesson.title, type: 'VIDEO', isPreview: false,
            resources: [], videoQualities: [{ height: 360, assetId: lowerQuality.asset.id }],
        }, admin);
        await expect(storage.deleteUnused(lowerQuality.asset.id)).rejects.toThrow('still in use');
        await expect(access.lesson(student, courseId, lesson.id, 360)).rejects.toThrow('outside');
        checkedType = 'application/pdf';
        bytes = Buffer.from('%PDF-1.7\n');
        checkedSize = bytes.length;
        const pdf = await storage.create(admin, input({
            purpose: 'LESSON_DOCUMENT', fileName: 'worksheet.pdf', mimeType: checkedType, sizeBytes: checkedSize, courseId,
        }));
        await storage.complete(admin.userId, pdf.asset.id);
        const pdfLesson = await curriculum.createLesson({ sectionId, type: 'PDF', title: 'Worksheet', isPreview: false, mediaAssetId: pdf.asset.id }, admin);
        const previewText = 'This is the first line.\nThis is the second line.';
        const textLesson = await curriculum.createLesson({ sectionId, type: 'TEXT', title: 'Reading', isPreview: true,
            content: previewText }, admin);
        const resourceUpload = await storage.create(admin, input({
            purpose: 'LESSON_RESOURCE', fileName: 'notes.pdf', mimeType: checkedType, sizeBytes: checkedSize, courseId,
        }));
        await storage.complete(admin.userId, resourceUpload.asset.id);
        const resource = await curriculum.createResource({
            lessonId: textLesson.id, title: 'Private notes', type: 'PDF', url: '', mediaAssetId: resourceUpload.asset.id,
        }, admin);
        await expect(access.previewText('visitor', courseId, textLesson.id)).rejects.toThrow('unavailable');
        await prisma.course.update({
            where: { id: courseId },
            data: { description: 'A complete course description for review.', thumbnailUrl: 'https://example.test/cover.png', learningOutcomes: ['Learn the topic'] },
        });

        const courses = new CoursesService(prisma);
        const reviews = new CourseReviewsService(prisma);
        await expect(reviews.getDetails(courseId)).resolves.toMatchObject({
            readinessErrors: ['Video lesson "Verified lesson" requires a positive duration'],
        });
        await expect(courses.submitCourse(courseId)).rejects.toThrow('requires a positive duration');
        await curriculum.updateLesson({ id: lesson.id, durationSeconds: 45 }, admin);
        await expect(courses.submitCourse(courseId)).resolves.toMatchObject({ status: 'PENDING_REVIEW' });
        await expect(reviews.getDetails(courseId)).resolves.toMatchObject({ readinessErrors: [] });
        await expect(reviews.approve({ courseId }, admin)).resolves.toMatchObject({ course: { status: 'APPROVED' } });
        await expect(courses.publishCourse(courseId)).resolves.toMatchObject({ status: 'PUBLISHED' });

        await expect(access.resource(student, courseId, textLesson.id, resource.id)).rejects.toThrow('outside');
        await prisma.enrollment.create({ data: { courseId, userId: student.userId, source: 'FREE' } });
        await expect(access.resource(student, courseId, textLesson.id, resource.id)).resolves.toHaveProperty('url');
        await expect(access.resource(student, courseId, pdfLesson.id, resource.id)).rejects.toThrow('outside');
        await expect(access.lesson(student, courseId, lesson.id)).resolves.toMatchObject({ availableQualities: [360] });
        await expect(access.lesson(student, courseId, lesson.id, 360)).resolves.toHaveProperty('url');
        expect(vi.mocked(provider.signRead).mock.calls.at(-1)?.[0].id).toBe(lowerQuality.asset.id);
        await expect(access.lesson(student, courseId, lesson.id, 720)).rejects.toThrow('unavailable');
        await expect(access.lesson(student, randomUUID(), lesson.id)).rejects.toThrow('outside');
        await expect(access.preview('visitor', courseId, lesson.id)).rejects.toThrow('unavailable');
        await prisma.courseLesson.update({ where: { id: lesson.id }, data: { isPreview: true } });
        await expect(access.preview('visitor', courseId, lesson.id, 360)).resolves.toMatchObject({ availableQualities: [360] });
        await expect(access.previewText('visitor', courseId, textLesson.id)).resolves.toBe(previewText);
        await expect(access.previewText('visitor', courseId, pdfLesson.id)).rejects.toThrow('unavailable');
        await expect(access.previewText('visitor', randomUUID(), textLesson.id)).rejects.toThrow('unavailable');
        await expect(access.preview('visitor', courseId, pdfLesson.id)).rejects.toThrow('unavailable');
        await prisma.courseLesson.update({ where: { id: pdfLesson.id }, data: { isPreview: true } });
        await expect(access.preview('visitor', courseId, pdfLesson.id)).resolves.toHaveProperty('url');
        expect(provider.signRead).toHaveBeenLastCalledWith(expect.objectContaining({ id: pdf.asset.id }));
        await expect(access.preview('visitor', courseId, pdfLesson.id, 360)).rejects.toThrow('unavailable');
        await prisma.enrollment.update({ where: { userId_courseId: { userId: student.userId, courseId } }, data: { status: 'REVOKED' } });
        await expect(access.lesson(student, courseId, lesson.id)).rejects.toThrow('outside');
        await expect(access.resource(student, courseId, textLesson.id, resource.id)).rejects.toThrow('outside');
    }, 15000);

    it('blocks deleting a public asset shared by two entities and protects replacement history', async () => {
        const { asset } = await storage.create(admin, input());
        const file = await storage.complete(admin.userId, asset.id);
        const other = await prisma.category.create({
            data: { name: 'Other fixture', description: 'Fixture category', slug: randomUUID(), iconName: 'Code2', iconColor: '#333333', iconBackground: '#ffffff', imageUrl: file.publicUrl },
        });
        await prisma.category.update({ where: { id: categoryId }, data: { imageUrl: `${file.publicUrl}?v=2` } });
        await expect(storage.deleteUnused(file.id)).rejects.toThrow('still in use');
        await prisma.category.update({ where: { id: other.id }, data: { imageUrl: 'https://example.test/replacement.png' } });
        await expect(storage.deleteUnused(file.id)).rejects.toThrow('still in use');
        await prisma.category.update({ where: { id: categoryId }, data: { imageUrl: null } });
        await expect(storage.deleteUnused(file.id)).resolves.toBe(true);
        await expect(prisma.category.update({ where: { id: categoryId }, data: { imageUrl: file.publicUrl } })).rejects.toThrow();
    }, 15000);
});
