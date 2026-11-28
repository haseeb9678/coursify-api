import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service.js';
import { CoursesService } from '../courses/courses.service.js';
import { CurriculumService } from '../curriculum/curriculum.service.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { R2StorageProvider } from '../storage/r2-storage.provider.js';
import { StorageAccessService } from '../storage/storage-access.service.js';
import { StorageService } from '../storage/storage.service.js';
import { InstructorReportsService } from './instructor-reports.service.js';
import { InstructorCoursesResolver, type InstructorCreateCourseInput } from './instructor-courses.resolver.js';

const database = process.env.COMMERCE_TEST_DATABASE_URL;
const isolated = database && /^postgres(?:ql)?:\/\/[^@/]+@(?:localhost|127\.0\.0\.1):\d+\/coursify_commerce_test$/.test(database);

describe.runIf(Boolean(isolated))('Instructor workspace on disposable PostgreSQL', () => {
    let prisma: PrismaService;
    let courses: CoursesService;
    let curriculum: CurriculumService;
    let reports: InstructorReportsService;
    const page = { page: 1, limit: 10 };

    beforeAll(() => {
        if (!isolated || !database) throw new Error('A disposable loopback database is required');
        prisma = new PrismaService(new ConfigService({ database: { url: database } }));
        courses = new CoursesService(prisma);
        curriculum = new CurriculumService(prisma);
        reports = new InstructorReportsService(prisma);
    });
    afterAll(async () => { await prisma?.$disconnect(); });

    async function fixture() {
        async function user(role: AuthenticatedUser['role']) {
            const entry = await prisma.user.create({
                data: { role, name: `Fixture ${role}`, email: `${randomUUID()}@fixture.example`, passwordHash: 'unused' },
            });
            return { role: entry.role, userId: entry.id, sessionId: randomUUID() };
        }
        const owner = await user('INSTRUCTOR');
        const other = await user('INSTRUCTOR');
        const student = await user('STUDENT');
        const admin = await user('ADMIN');
        const category = await prisma.category.create({ data: { name: 'Fixture', slug: randomUUID(), description: '',
            iconName: 'Code2', iconColor: '#222222', iconBackground: '#ffffff' } });
        const input = { categoryId: category.id, title: 'Instructor fixture', pricingType: 'FREE' as const, priceMinorUnits: 0,
            thumbnailUrl: 'https://example.test/cover.png', description: 'A description suitable for submitting to review.', learningOutcomes: ['Read the lesson'] };
        const own = await courses.createCourse({ ...input, slug: randomUUID(), instructorId: owner.userId }, owner);
        const foreign = await courses.createCourse({ ...input, slug: randomUUID(), instructorId: other.userId }, other);
        return { owner, other, student, admin, own, foreign };
    }

    it('scopes course and curriculum reads and serializable writes, and preserves approval', async () => {
        const { owner, other, own, foreign } = await fixture();
        const owned = await courses.findCourses(page, undefined, undefined, owner.userId);
        expect(owned.items.map(({ id }) => id)).toEqual([own.id]);
        await expect(courses.findCourse(foreign.id, owner.userId)).rejects.toThrow('Course not found');
        await expect(courses.updateCourse({ id: foreign.id, title: 'Unauthorized' }, owner.userId)).rejects.toThrow('Course not found');
        await expect(courses.updateCourse({ id: own.id, instructorId: other.userId }, owner.userId)).rejects.toThrow('ownership');
        await expect(courses.deleteCourse(foreign.id, owner.userId)).rejects.toThrow('Course not found');
        await expect(courses.updateCourse({ id: own.id, title: 'Edited title' }, owner.userId)).resolves.toHaveProperty('title', 'Edited title');
        await expect(courses.instructorReadiness(own.id, owner.userId)).resolves.toContain('At least one curriculum section is required');
        const section = await curriculum.createSection({ courseId: own.id, title: 'Owned module' }, owner);
        const foreignSection = await curriculum.createSection({ courseId: foreign.id, title: 'Foreign module' }, other);
        await expect(curriculum.getCurriculum(foreign.id, owner.userId)).rejects.toThrow('Course not found');
        await expect(curriculum.updateSection({ id: foreignSection.id, title: 'Unauthorized' }, owner.userId)).rejects.toThrow('Course not found');
        const lesson = await curriculum.saveLesson({ sectionId: section.id, title: 'Owned lesson', type: 'TEXT', isPreview: false,
            content: 'A complete text lesson for the workspace.', resources: [{ title: 'Reference', type: 'LINK', url: 'https://example.test/reference' }] }, owner);
        const second = await curriculum.saveLesson({ sectionId: section.id, title: 'Second lesson', type: 'TEXT', isPreview: false,
            content: 'Another complete text lesson for the workspace.', resources: [] }, owner);
        await expect(curriculum.reorderLessons({ sectionId: section.id, orderedLessonIds: [second.id, lesson.id] }, owner.userId)).resolves.toHaveProperty('success', true);
        expect((await curriculum.getCurriculum(own.id, owner.userId)).sections[0].lessons.map(({ id }) => id)).toEqual([second.id, lesson.id]);
        await expect(curriculum.moveLesson({ lessonId: lesson.id, destinationSectionId: foreignSection.id }, owner.userId)).rejects.toThrow('across courses');
        await expect(curriculum.deleteLesson(lesson.id, other.userId)).rejects.toThrow('Course not found');
        await expect(curriculum.deleteResource(lesson.resources[0].id, undefined, other.userId)).rejects.toThrow('Course not found');
        await expect(courses.instructorReadiness(own.id, owner.userId)).resolves.toEqual([]);
        await expect(courses.submitCourse(own.id, owner.userId)).resolves.toHaveProperty('status', 'PENDING_REVIEW');
        await expect(curriculum.deleteLesson(lesson.id, owner.userId)).rejects.toThrow('lifecycle');
        await expect(courses.withdrawSubmission(own.id, owner.userId)).resolves.toHaveProperty('status', 'DRAFT');
        await expect(courses.deleteCourse(own.id, owner.userId)).resolves.toHaveProperty('success', true);
    });

    it('creates imported curriculum with the owner’s draft and rolls back failed imports', async () => {
        const { owner, own } = await fixture();
        const resolver = new InstructorCoursesResolver(courses, curriculum);
        const input = {
            title: 'Imported course', slug: randomUUID(), categoryId: own.category.id, pricingType: 'FREE', priceMinorUnits: 0,
            thumbnailUrl: 'https://example.test/cover.png', description: 'A description suitable for submitting to review.', learningOutcomes: ['Read the lesson'],
            curriculum: [{ title: 'First module', lessons: [
                { title: 'Welcome reading', type: 'TEXT', content: 'A valid imported reading for this course.', isPreview: false,
                    resources: [{ title: 'Reference', url: 'https://example.test/reference', type: 'LINK' }] },
                { title: 'Draft video', type: 'VIDEO', isPreview: false, resources: [] },
            ] }],
        } satisfies InstructorCreateCourseInput;
        const { course } = await resolver.instructorCreateCourse(owner, input);
        expect(course).toMatchObject({ status: 'DRAFT', instructor: { id: owner.userId }, sectionCount: 1, lessonCount: 2 });
        expect((await curriculum.getCurriculum(course.id, owner.userId)).sections[0].lessons).toMatchObject([
            { title: 'Welcome reading', resources: [{ url: 'https://example.test/reference' }] }, { title: 'Draft video', videoAssetId: null },
        ]);
        expect(await courses.instructorReadiness(course.id, owner.userId)).toContain('Video lesson "Draft video" requires a video');
        const slug = randomUUID();
        await expect(resolver.instructorCreateCourse(owner, { ...input, slug,
            curriculum: [{ title: 'Invalid module', lessons: [{ title: 'Invalid link', type: 'TEXT', isPreview: false,
                resources: [{ title: 'Signed file', type: 'LINK', url: 'https://example.test/private?X-Amz-Signature=invalid' }] }] }],
        })).rejects.toThrow('public HTTPS');
        expect(await prisma.course.findUnique({ where: { slug } })).toBeNull();
    });

    it('reports enrollments, feedback and verified sales within course ownership', async () => {
        const { owner, student, admin, own, foreign } = await fixture();
        await prisma.enrollment.createMany({ data: [
            { userId: student.userId, courseId: own.id, source: 'FREE', status: 'COMPLETED', completedAt: new Date() },
            { userId: student.userId, courseId: foreign.id, source: 'FREE' },
        ] });
        await prisma.courseReview.create({ data: {
            courseId: own.id, reviewerId: admin.userId, decision: 'CHANGES_REQUESTED', previousStatus: 'PENDING_REVIEW',
            newStatus: 'REJECTED', feedback: 'Fixture publication feedback',
        } });
        const analytics = await reports.analytics(owner.userId, 7);
        expect(analytics).toMatchObject({ totalCourses: 1, enrollments: 1, students: 1, completed: 1, completionRate: 100 });
        expect(analytics.trend[0]).toMatchObject({ enrollments: 1, newStudents: 1 });
        await expect(reports.analytics(owner.userId, 7, foreign.id)).rejects.toThrow('Course not found');
        expect((await reports.enrollments(owner.userId, page, { status: 'COMPLETED' })).items[0]).toMatchObject({ courseId: own.id, studentId: student.userId });
        expect((await reports.enrollments(owner.userId, page, { studentId: student.userId }, true)).meta.total).toBe(1);
        expect((await reports.reviews(owner.userId, page)).items[0].feedback).toBe('Fixture publication feedback');
        for (const courseId of [own.id, foreign.id]) {
            const order = await prisma.purchaseOrder.create({ data: {
                orderNumber: randomUUID(), userId: student.userId, courseId, courseTitleSnapshot: 'Snapshot', currency: 'USD',
                subtotalMinorUnits: 5000, discountMinorUnits: 0, totalMinorUnits: 5000, status: 'PARTIALLY_REFUNDED',
                paidAt: new Date(), expiresAt: new Date(),
            } });
            const payment = await prisma.payment.create({ data: { orderId: order.id, currency: 'USD', amountMinorUnits: 5000,
                refundedMinorUnits: 1000, status: 'PARTIALLY_REFUNDED', idempotencyKey: randomUUID(),
                checkoutOrigin: 'https://example.test', expiresAt: new Date(), paidAt: new Date(),
                disputes: { create: { stripeDisputeId: randomUUID(), amountMinorUnits: 500, currency: 'USD', status: 'lost', reason: 'fixture', createdAt: new Date() } },
            } });
            await prisma.purchaseOrder.update({ where: { id: order.id }, data: { successfulPaymentId: payment.id } });
        }
        const sales = await reports.sales(owner.userId, page, 7);
        expect(sales.totals).toEqual([{ currency: 'USD', isTestMode: true, orders: 1, gross: '5000', refunded: '1000', disputed: '500', net: '3500' }]);
        expect(sales.items).toHaveLength(1);
        expect(sales.trend[0].net).toBe('3500');
        await expect(courses.deleteCourse(own.id, owner.userId)).rejects.toThrow('enrollment or order');
    });

    it('protects the upload and private read paths from other instructors', async () => {
        const { owner, other, own, foreign } = await fixture();
        const provider = new R2StorageProvider(new ConfigService({
            STORAGE_ENABLED: 'true', R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'b'.repeat(32),
            R2_SECRET_ACCESS_KEY: 'c'.repeat(64), R2_PUBLIC_URL: 'https://public.fixture.example',
        }));
        const storage = new StorageService(prisma, provider);
        const access = new StorageAccessService(prisma, storage, provider);
        const input = { requestId: randomUUID(), purpose: 'LESSON_DOCUMENT' as const, fileName: 'course.pdf', mimeType: 'application/pdf', sizeBytes: 24 };
        await expect(storage.create(owner, { ...input, courseId: foreign.id })).rejects.toThrow('Course not found');
        const upload = await storage.create(owner, { ...input, courseId: own.id });
        expect((await storage.list(page, undefined, false, owner.userId)).items[0].id).toBe(upload.asset.id);
        expect((await storage.list(page, undefined, false, other.userId)).items).toEqual([]);
        await expect(access.instructorRead(other.userId, upload.asset.id)).rejects.toThrow('Media not found');
        await expect(storage.deleteUnused(upload.asset.id, undefined, other.userId)).rejects.toThrow('Media not found');
    });
});
