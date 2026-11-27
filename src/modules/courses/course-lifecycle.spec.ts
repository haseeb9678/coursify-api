import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host.js';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { ROLES_METADATA_KEY } from '../../common/decorators/roles.decorator.js';
import { GqlAuthGuard } from '../../common/guards/gql-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { CourseStatus } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { CategoriesService } from '../categories/categories.service.js';
import { CourseReviewsService } from '../course-reviews/course-reviews.service.js';
import { CurriculumService } from '../curriculum/curriculum.service.js';
import { AdminCoursesResolver } from './admin-courses.resolver.js';
import { CoursesService } from './courses.service.js';

const actor = { userId: 'admin' } as AuthenticatedUser;
const timestamp = new Date('2026-11-25T00:00:00.000Z');

function fixture(status: CourseStatus) {
    const lesson = {
        id: 'lesson', title: 'Introduction', type: 'TEXT', isPreview: false, _count: { resources: 1 },
        content: 'A complete introduction to the first course topic.',
        videoUrl: null, documentUrl: null, durationSeconds: null,
        resources: [{ id: 'resource' }],
    };
    const sections = [{ title: 'Getting started', lessons: [lesson], _count: { lessons: 1 } }];
    const record = {
        id: 'course', status, title: 'Original Course', slug: 'original-course',
        shortDescription: 'Introduction to the topic', description: 'A complete course description for review.',
        categoryId: 'category', category: { id: 'category', name: 'Design', slug: 'design', status: 'ACTIVE' },
        instructor: { id: 'instructor', name: 'Instructor', avatar: null, role: 'INSTRUCTOR', status: 'ACTIVE' },
        thumbnailUrl: 'https://example.com/thumbnail', promotionalVideoUrl: null, isFeatured: true,
        pricingType: 'PAID', priceMinorUnits: 1000, discountedPriceMinorUnits: null, currency: 'PKR',
        learningOutcomes: ['Understand the topic'], requirements: [], targetAudience: [],
        submittedAt: timestamp, approvedAt: timestamp, publishedAt: timestamp, archivedAt: null,
        createdAt: timestamp, updatedAt: timestamp, sections, _count: { reviews: 0 },
    };
    const createReview = vi.fn(async () => { record._count.reviews += 1; });
    const update = vi.fn(async ({ where, data }: { where: { status?: CourseStatus }; data: object }) => {
        if (where.status) expect(where.status).toBe(record.status);
        return Object.assign(record, data);
    });
    const courseDelete = vi.fn();
    const updateSection = vi.fn();
    const findPublic = vi.fn(async ({ where }: { where: { status: CourseStatus } }) =>
        record.status === where.status ? [record] : [],
    );
    const transaction = {
        $queryRaw: vi.fn(async () => [{ status: record.status }]),
        course: {
            findUnique: vi.fn().mockResolvedValue(record),
            findFirst: vi.fn(async ({ where }: { where: { status: CourseStatus } }) => (await findPublic({ where }))[0] ?? null),
            count: vi.fn(async ({ where }: { where: { status: CourseStatus } }) => (await findPublic({ where })).length),
            update, delete: courseDelete, findMany: findPublic,
            create: vi.fn().mockImplementation(({ data }: { data: object }) => Object.assign(record, data)),
        },
        category: {
            findUnique: vi.fn().mockResolvedValue(record.category),
            count: vi.fn().mockResolvedValue(1),
            findMany: vi.fn(async ({ select }: { select: { _count: { select: { courses: { where: { status: CourseStatus } } } } } }) => [{
                ...record.category,
                _count: { courses: (await findPublic({ where: select._count.select.courses.where })).length },
            }]),
        },
        user: { findUnique: vi.fn().mockResolvedValue(record.instructor) },
        courseSection: {
            findMany: vi.fn().mockResolvedValue(sections),
            findUnique: vi.fn().mockResolvedValue({ id: 'section', courseId: record.id }),
            update: updateSection,
        },
        courseReview: { create: createReview },
    };
    const runTransaction = vi.fn(async (work: Promise<unknown>[] | ((tx: typeof transaction) => Promise<unknown>)) =>
        typeof work === 'function' ? work(transaction) : Promise.all(work),
    );
    const prisma = { ...transaction, $transaction: runTransaction } as unknown as PrismaService;
    return {
        service: new CoursesService(prisma),
        categories: new CategoriesService(prisma),
        curriculum: new CurriculumService(prisma),
        approvals: new CourseReviewsService(prisma),
        record, sections, update, createReview, courseDelete, updateSection, runTransaction, findPublic, transaction,
    };
}

describe('course lifecycle', () => {
    it('creates and updates a draft without requiring curriculum or overwriting unchanged fields', async () => {
        const { service, record, update, transaction } = fixture('ARCHIVED');
        record.sections.length = 0;
        const created = await service.createCourse({
            title: 'Created course', categoryId: 'category', instructorId: 'instructor',
            pricingType: 'FREE', priceMinorUnits: 0, currency: 'PKR',
        }, actor);
        expect(created.status).toBe('DRAFT');
        expect(transaction.course.create).toHaveBeenCalledOnce();
        await service.updateCourse({
            id: record.id, title: ' Created course ', pricingType: 'PAID', priceMinorUnits: 2600,
            currency: 'PKR', learningOutcomes: [' One '], requirements: [' Two '], targetAudience: [' Three '],
        });
        expect(update).toHaveBeenLastCalledWith(expect.objectContaining({
            where: { id: record.id, status: 'DRAFT' },
            data: {
                pricingType: 'PAID', priceMinorUnits: 2600, learningOutcomes: ['One'],
                requirements: ['Two'], targetAudience: ['Three'],
            },
        }));
        expect(record.status).toBe('DRAFT');
        await expect(service.submitCourse(record.id)).rejects.toThrow('curriculum section');
    });

    it('requires an explicit published restoration and reapproval before republishing', async () => {
        const { service, curriculum, approvals, record, sections, update, createReview, updateSection, runTransaction, transaction } = fixture('PUBLISHED');
        record._count.reviews = 1;
        await expect(service.updateCourse({ id: record.id, title: 'Original Course' })).resolves.toMatchObject({ status: 'PUBLISHED' });
        await expect(service.updateCourse({ id: record.id, title: 'Changed' })).rejects.toThrow('Material course content');
        await expect(service.restoreCourse(record.id)).rejects.toThrow('explicitly confirm');
        await expect(service.restoreCourse(record.id, 'APPROVED')).rejects.toThrow('status changed');
        expect(update).not.toHaveBeenCalled();

        expect(await service.findFeaturedCourses(6)).toHaveLength(1);
        await expect(service.restoreCourse(record.id, 'PUBLISHED')).resolves.toMatchObject({ status: 'DRAFT', canDelete: false });
        expect(record).toMatchObject({
            submittedAt: null, approvedAt: null, publishedAt: null, archivedAt: null,
            isFeatured: true, priceMinorUnits: 1000, currency: 'PKR', _count: { reviews: 1 },
        });
        expect(record.sections).toBe(sections);
        expect(record.sections[0].lessons[0].resources).toEqual([{ id: 'resource' }]);
        expect(await service.findFeaturedCourses(6)).toEqual([]);
        await expect(service.deleteCourse(record.id)).rejects.toThrow('without review history');
        await expect(service.publishCourse(record.id)).rejects.toThrow('cannot move');

        await service.updateCourse({ id: record.id, title: 'Revised Course' });
        await curriculum.updateSection({ id: 'section', title: 'Draft section' });
        await expect(service.submitCourse(record.id)).resolves.toMatchObject({ status: 'PENDING_REVIEW' });
        await expect(service.updateCourse({ id: record.id, title: 'Review edit' })).rejects.toThrow('Material course content');
        await expect(curriculum.updateSection({ id: 'section', title: 'Review edit' })).rejects.toThrow('curriculum cannot be edited');
        expect(updateSection).toHaveBeenCalledOnce();
        expect(transaction.$queryRaw).toHaveBeenCalledWith(expect.arrayContaining([expect.stringContaining("FOR UPDATE")]), record.id);
        await expect(approvals.approve({ courseId: record.id }, actor)).resolves.toMatchObject({ course: { status: 'APPROVED' } });
        expect(createReview).toHaveBeenCalledOnce();
        await expect(service.publishCourse(record.id)).resolves.toMatchObject({ status: 'PUBLISHED' });
        expect(await service.findFeaturedCourses(6)).toHaveLength(1);
        expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    });

    it('withdraws, rejects, restores, archives, and keeps rejection history', async () => {
        const { service, approvals, record, createReview, update } = fixture('PENDING_REVIEW');
        await expect(service.withdrawSubmission(record.id)).resolves.toMatchObject({ status: 'DRAFT' });
        await expect(approvals.approve({ courseId: record.id }, actor)).rejects.toThrow('Only pending-review');
        await service.submitCourse(record.id);
        const feedback = 'Explain how the exercises connect to the learning outcomes.';
        await approvals.reject({ courseId: record.id, feedback }, actor);
        expect(createReview).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ decision: 'REJECTED', feedback }),
        }));
        await expect(service.publishCourse(record.id)).rejects.toThrow('cannot move');
        await service.updateCourse({ id: record.id, title: 'Updated following feedback' });
        await service.restoreCourse(record.id, 'REJECTED');
        await service.submitCourse(record.id);
        await approvals.approve({ courseId: record.id }, actor);
        await service.restoreCourse(record.id, 'APPROVED');
        expect(record.approvedAt).toBeNull();
        await service.submitCourse(record.id);
        await approvals.approve({ courseId: record.id }, actor);
        await service.publishCourse(record.id);
        await service.archiveCourse(record.id);
        await expect(service.updateCourse({ id: record.id, title: 'Archived edit' })).rejects.toThrow('Material course content');
        await expect(service.restoreCourse(record.id)).resolves.toMatchObject({ status: 'DRAFT' });
        expect(record._count.reviews).toBe(3);
        expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: record.id, status: 'PUBLISHED' } }));
    });

    it('removes and restores public listings, detail, related courses, and category counts with publication', async () => {
        const { service, categories, approvals, record } = fixture('PUBLISHED');
        const pagination = { page: 1, limit: 10 };
        async function visible(expected: number) {
            expect((await service.findPublicCourses(pagination)).meta.total).toBe(expected);
            expect(await service.findFeaturedCourses(6)).toHaveLength(expected);
            expect(await service.findRelatedCourses('another-course', 6)).toHaveLength(expected);
            expect((await categories.findPublicCategories(pagination)).items[0].courseCount).toBe(expected);
            if (expected) {
                await expect(service.findPublicCourse(record.slug)).resolves.toMatchObject({ id: record.id });
            } else {
                await expect(service.findPublicCourse(record.slug)).rejects.toThrow('Published course not found');
            }
        }

        await visible(1);
        await service.restoreCourse(record.id, 'PUBLISHED');
        await visible(0);
        await service.submitCourse(record.id);
        await approvals.approve({ courseId: record.id }, actor);
        await service.publishCourse(record.id);
        await visible(1);
        await service.archiveCourse(record.id);
        await visible(0);
    });

    it('keeps the existing restore mutation callable and admin-guarded', async () => {
        const module = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
        try {
            await module.init();
            const schema = await module.get(GraphQLSchemaFactory).create([AdminCoursesResolver]);
            const restore = schema.getMutationType()?.getFields().adminRestoreCourse;
            expect(restore?.args.map(({ name, type }) => [name, String(type)])).toEqual([
                ['id', 'ID!'],
                ['expectedStatus', 'CourseStatus'],
            ]);
            expect(Reflect.getMetadata(GUARDS_METADATA, AdminCoursesResolver)).toEqual([GqlAuthGuard, RolesGuard]);
            expect(Reflect.getMetadata(ROLES_METADATA_KEY, AdminCoursesResolver)).toEqual(['ADMIN']);
            const guard = new RolesGuard(new Reflector());
            const context = (user?: { userId: string; sessionId: string; role: string }) => {
                const execution = new ExecutionContextHost(
                    [undefined, { id: 'course' }, { req: { user } }, undefined],
                    AdminCoursesResolver,
                    AdminCoursesResolver.prototype.adminRestoreCourse,
                );
                execution.setType('graphql');
                return execution;
            };
            expect(() => guard.canActivate(context())).toThrow('Authentication required');
            expect(() => guard.canActivate(context({ userId: 'student', sessionId: 'session', role: 'STUDENT' })))
                .toThrow('You do not have permission');
            expect(guard.canActivate(context({ userId: 'admin', sessionId: 'session', role: 'ADMIN' }))).toBe(true);
        } finally {
            await module.close();
        }
    }, 15000);

    it('surfaces a concurrent transaction conflict without attempting a second transition', async () => {
        const { service, record, runTransaction, update } = fixture('PUBLISHED');
        runTransaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('write conflict', {
            code: 'P2034', clientVersion: 'test',
        }));
        await expect(service.restoreCourse(record.id, 'PUBLISHED')).rejects.toThrow('changed during this operation');
        expect(runTransaction).toHaveBeenCalledOnce();
        expect(update).not.toHaveBeenCalled();
        expect(record.status).toBe('PUBLISHED');
    });
});
