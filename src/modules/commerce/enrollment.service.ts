import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { PaginationInput } from '../../common/pagination/pagination.input.js';
import { createPaginationMeta, getPaginationWindow } from '../../common/pagination/pagination.utils.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { CommerceStore } from './commerce.store.js';
import { grantsAccess } from './payment-policy.js';

function learningCourseFilter(userId: string, courseId: string): Prisma.CourseWhereInput {
    return {
        id: courseId,
        status: { in: ['PUBLISHED', 'ARCHIVED'] },
        enrollments: { some: { userId, status: { in: ['ACTIVE', 'COMPLETED'] } } },
    };
}

const lessonCommentFields = {
    id: true, body: true, createdAt: true, author: { select: { name: true } },
} satisfies Prisma.LessonCommentSelect;

export const enrollmentInclude = {
    course: { select: {
        id: true, title: true, slug: true, thumbnailUrl: true, status: true, level: true, categoryId: true,
        instructor: { select: { name: true } }, category: { select: { name: true } },
    } },
    order: { select: { id: true, orderNumber: true } },
} satisfies Prisma.EnrollmentInclude;

@Injectable()
export class EnrollmentService {
    constructor(private readonly store: CommerceStore) {}

    async enrollFree(userId: string, courseId: string) {
        return this.store.transaction(async (tx) => {
            await this.store.assertStudent(tx, userId);
            const course = await this.store.publishedCourse(tx, courseId);
            if (course.pricingType !== 'FREE' || course.priceMinorUnits !== 0 || course.discountedPriceMinorUnits !== null) {
                throw new BadRequestException('This course is not eligible for free enrollment.');
            }

            const previous = await tx.enrollment.findUnique({
                where: { userId_courseId: { userId, courseId } }, include: enrollmentInclude,
            });
            if (previous && grantsAccess(previous.status)) return previous;
            if (previous) throw new ConflictException('A previous enrollment requires administrator review.');
            const pendingOrder = await tx.purchaseOrder.findFirst({
                where: { userId, courseId, status: 'PENDING', isTestMode: true }, select: { id: true },
            });
            if (pendingOrder) throw new ConflictException('Verify your existing checkout before enrolling.');
            return tx.enrollment.create({
                data: { userId, courseId, source: 'FREE' }, include: enrollmentInclude,
            });
        });
    }

    async learningContent(userId: string, courseId: string) {
        return this.store.transaction(async (tx) => {
            await this.store.assertStudent(tx, userId);
            const course = await tx.course.findFirst({
                where: learningCourseFilter(userId, courseId),
                select: {
                    id: true, title: true,
                    sections: { orderBy: { position: 'asc' }, select: {
                        id: true, title: true,
                        lessons: { orderBy: { position: 'asc' }, select: {
                            id: true, title: true, description: true, type: true,
                            content: true, videoUrl: true, documentUrl: true, durationSeconds: true,
                            resources: { orderBy: { position: 'asc' }, select: {
                                id: true, title: true, type: true, url: true,
                            } },
                        } },
                    } },
                },
            });
            if (!course) throw new ForbiddenException('Learning content requires active enrollment and available course material.');
            return course;
        });
    }

    async lessonComments(userId: string, courseId: string, lessonId: string, pagination: PaginationInput) {
        const { page, limit, skip } = getPaginationWindow(pagination);
        return this.store.transaction(async (tx) => {
            await this.assertLessonAccess(tx, userId, courseId, lessonId);
            const where = { lessonId };
            const items = await tx.lessonComment.findMany({
                where, skip, take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: lessonCommentFields,
            });
            const total = await tx.lessonComment.count({ where });
            return { items, meta: createPaginationMeta(page, limit, total) };
        });
    }

    async postLessonComment(userId: string, courseId: string, lessonId: string, body: string) {
        const text = body.trim();
        if (!text || text.length > 2000) {
            throw new BadRequestException('Enter a comment between 1 and 2,000 characters.');
        }
        return this.store.transaction(async (tx) => {
            await this.assertLessonAccess(tx, userId, courseId, lessonId);
            return tx.lessonComment.create({ data: { lessonId, authorId: userId, body: text }, select: lessonCommentFields });
        });
    }

    private async assertLessonAccess(tx: Prisma.TransactionClient, userId: string, courseId: string, lessonId: string) {
        await this.store.assertStudent(tx, userId);
        const lesson = await tx.courseLesson.findFirst({
            where: { id: lessonId, section: { course: learningCourseFilter(userId, courseId) } },
            select: { id: true },
        });
        if (!lesson) throw new ForbiddenException('Lesson discussion requires access to this lesson.');
    }
}
