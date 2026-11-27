import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import {
    CourseReviewDecision,
    CourseStatus,
    CoursePricingType,
    LessonType,
    CategoryStatus,
    UserRole,
    UserStatus,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import { PaginationInput } from '../../common/pagination/pagination.input.js';
import { createPaginationMeta, getPaginationWindow } from '../../common/pagination/pagination.utils.js';
import { mapPrismaError } from '../../common/utils/prisma-error.util.js';
import { assertCourseTransition, courseTransaction } from '../courses/course-lifecycle.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import {
    AdminApproveCourseInput,
    AdminCourseApprovalsFilterInput,
    AdminRejectCourseInput,
} from './dto/course-review.inputs.js';

@Injectable()
export class CourseReviewsService {
    private readonly logger = new Logger(CourseReviewsService.name);
    constructor(private readonly prisma: PrismaService) {}

    private readonly courseSelect = {
        id: true, title: true, slug: true, shortDescription: true, description: true,
        thumbnailUrl: true, promotionalVideoUrl: true,
        category: { select: { id: true, name: true, slug: true, status: true } },
        instructor: { select: { id: true, name: true, avatar: true, role: true, status: true } },
        level: true, language: true, pricingType: true, priceMinorUnits: true,
        discountedPriceMinorUnits: true, currency: true, learningOutcomes: true,
        requirements: true, targetAudience: true, status: true, isFeatured: true,
        submittedAt: true, approvedAt: true, publishedAt: true, archivedAt: true,
        createdAt: true, updatedAt: true,
        sections: {
            select: {
                title: true, position: true,
                _count: { select: { lessons: true } },
                lessons: {
                    orderBy: { position: 'asc' as const },
                    select: { title: true, type: true, content: true, videoUrl: true, documentUrl: true, durationSeconds: true },
                },
            },
            orderBy: { position: 'asc' as const },
        },
    } as const;

    private mapCourse(course: {
        id: string; title: string; slug: string; shortDescription: string; description: string;
        thumbnailUrl: string | null; promotionalVideoUrl: string | null;
        category: { id: string; name: string; slug: string }; instructor: { id: string; name: string; avatar: string | null };
        level: import('../../generated/prisma/enums.js').CourseLevel; language: string;
        pricingType: CoursePricingType; priceMinorUnits: number; discountedPriceMinorUnits: number | null;
        currency: string; learningOutcomes: string[]; requirements: string[]; targetAudience: string[];
        status: CourseStatus; isFeatured: boolean; submittedAt: Date | null; approvedAt: Date | null;
        publishedAt: Date | null; archivedAt: Date | null; createdAt: Date; updatedAt: Date;
        sections: Array<{ _count: { lessons: number } }>;
    }) {
        return {
            ...course,
            pricing: {
                type: course.pricingType,
                currency: course.currency,
                priceMinorUnits: course.priceMinorUnits,
                discountedPriceMinorUnits: course.discountedPriceMinorUnits,
            },
            sectionCount: course.sections.length,
            lessonCount: course.sections.reduce((total, section) => total + section._count.lessons, 0),
        };
    }

    async findApprovals(pagination: PaginationInput, filter?: AdminCourseApprovalsFilterInput) {
        const window = getPaginationWindow(pagination);
        const search = filter?.search?.trim();
        const where: Prisma.CourseWhereInput = {
            ...(filter?.status
                ? { status: filter.status }
                : { status: { in: [CourseStatus.PENDING_REVIEW, CourseStatus.APPROVED, CourseStatus.REJECTED] } }),
        };
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { instructor: { name: { contains: search, mode: 'insensitive' } } },
            ];
        }
        if (filter?.categoryId) where.categoryId = filter.categoryId;
        const [courses, total] = await this.prisma.$transaction([
            this.prisma.course.findMany({
                where,
                orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
                skip: window.skip,
                take: window.take,
                select: this.courseSelect,
            }),
            this.prisma.course.count({ where }),
        ]);
        return {
            items: courses.map((course) => this.mapCourse(course)),
            meta: createPaginationMeta(window.page, window.limit, total),
        };
    }

    async getStats() {
        const monthStart = new Date();
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);
        const [pending, approved, rejected, reviewedThisMonth] = await this.prisma.$transaction([
            this.prisma.course.count({ where: { status: CourseStatus.PENDING_REVIEW } }),
            this.prisma.course.count({ where: { status: CourseStatus.APPROVED } }),
            this.prisma.course.count({ where: { status: CourseStatus.REJECTED } }),
            this.prisma.courseReview.count({ where: { createdAt: { gte: monthStart } } }),
        ]);
        return { pendingReviews: pending, approvedCourses: approved, rejectedCourses: rejected, reviewedThisMonth };
    }

    private validateReadiness(course: {
        title: string;
        description: string;
        thumbnailUrl: string | null;
        pricingType: CoursePricingType;
        priceMinorUnits: number;
        discountedPriceMinorUnits: number | null;
        learningOutcomes: string[];
        category: { status: CategoryStatus };
        instructor: { role: UserRole; status: UserStatus };
        sections: Array<{ lessons: Array<{
            title: string;
            type: LessonType;
            content: string;
            videoUrl: string | null;
            documentUrl: string | null;
            durationSeconds: number | null;
        }> }>;
    }): string[] {
        const errors: string[] = [];
        if (course.title.trim().length < 2) errors.push('Course title is required');
        if (course.description.trim().length < 20) errors.push('Course description must be at least 20 characters');
        if (!course.thumbnailUrl) errors.push('A thumbnail is required');
        if (course.category.status !== CategoryStatus.ACTIVE) errors.push('Category must be active');
        if (course.instructor.role !== UserRole.INSTRUCTOR || course.instructor.status !== UserStatus.ACTIVE) {
            errors.push('Instructor must be active');
        }
        if (course.pricingType === CoursePricingType.FREE) {
            if (course.priceMinorUnits !== 0 || course.discountedPriceMinorUnits !== null) {
                errors.push('Free course pricing is invalid');
            }
        } else if (course.priceMinorUnits <= 0) {
            errors.push('Paid course price must be greater than zero');
        }
        if (course.learningOutcomes.length === 0) errors.push('At least one learning outcome is required');
        if (course.sections.length === 0) errors.push('At least one curriculum section is required');
        for (const section of course.sections) {
            if (section.lessons.length === 0) errors.push('Every section must contain at least one lesson');
            for (const lesson of section.lessons) {
                if (lesson.type === LessonType.VIDEO && (!lesson.videoUrl || (lesson.durationSeconds ?? 0) <= 0)) {
                    errors.push(`Video lesson "${lesson.title}" requires a URL and positive duration`);
                }
                if (lesson.type === LessonType.TEXT && lesson.content.trim().length < 20) {
                    errors.push(`Text lesson "${lesson.title}" requires content`);
                }
                if (lesson.type === LessonType.PDF && !lesson.documentUrl) {
                    errors.push(`PDF lesson "${lesson.title}" requires a document URL`);
                }
            }
        }
        return errors;
    }

    async getDetails(courseId: string) {
        const course = await this.prisma.course.findUnique({
            where: { id: courseId }, select: this.courseSelect,
        });
        if (!course) throw new NotFoundException('Course not found');
        const reviews = await this.prisma.courseReview.findMany({
            where: { courseId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
                id: true, courseId: true, decision: true, feedback: true,
                previousStatus: true, newStatus: true, createdAt: true,
                reviewer: { select: { id: true, name: true } },
            },
        });
        return {
            course: this.mapCourse(course),
            readinessErrors: this.validateReadiness(course),
            recentReviews: reviews.map((review) => ({
                ...review,
                reviewer: { id: review.reviewer.id, name: review.reviewer.name },
            })),
        };
    }

    async approve(input: AdminApproveCourseInput, actor: AuthenticatedUser) {
        try {
            const course = await courseTransaction(this.prisma, async (transaction) => {
                const existing = await transaction.course.findUnique({
                    where: { id: input.courseId },
                    select: this.courseSelect,
                });
                if (!existing) throw new NotFoundException('Course not found');
                assertCourseTransition(existing.status, CourseStatus.APPROVED, 'Only pending-review courses can be approved');
                const readinessErrors = this.validateReadiness(existing);
                if (readinessErrors.length > 0) {
                    throw new BadRequestException(`Course is not ready for approval: ${readinessErrors.join('; ')}`);
                }
                await transaction.courseReview.create({
                    data: {
                        courseId: existing.id,
                        reviewerId: actor.userId,
                        decision: CourseReviewDecision.APPROVED,
                        feedback: input.feedback?.trim() || 'Approved',
                        previousStatus: CourseStatus.PENDING_REVIEW,
                        newStatus: CourseStatus.APPROVED,
                    },
                });
                const updated = await transaction.course.update({
                    where: { id: existing.id, status: CourseStatus.PENDING_REVIEW },
                    data: { status: CourseStatus.APPROVED, approvedAt: new Date() },
                    select: this.courseSelect,
                });
                return updated;
            });
            this.logger.log(`Admin ${actor.userId} approved course ${course.id}`);
            return { course: this.mapCourse(course) };
        } catch (error: unknown) {
            const mapped = mapPrismaError(error);
            if (mapped) throw mapped;
            throw error;
        }
    }

    async reject(input: AdminRejectCourseInput, actor: AuthenticatedUser) {
        try {
            const course = await courseTransaction(this.prisma, async (transaction) => {
                const existing = await transaction.course.findUnique({
                    where: { id: input.courseId },
                    select: { id: true, status: true },
                });
                if (!existing) throw new NotFoundException('Course not found');
                assertCourseTransition(existing.status, CourseStatus.REJECTED, 'Only pending-review courses can be rejected');
                await transaction.courseReview.create({
                    data: {
                        courseId: existing.id,
                        reviewerId: actor.userId,
                        decision: CourseReviewDecision.REJECTED,
                        feedback: input.feedback.trim(),
                        previousStatus: CourseStatus.PENDING_REVIEW,
                        newStatus: CourseStatus.REJECTED,
                    },
                });
                const updated = await transaction.course.update({
                    where: { id: existing.id, status: CourseStatus.PENDING_REVIEW },
                    data: { status: CourseStatus.REJECTED, approvedAt: null },
                    select: this.courseSelect,
                });
                return updated;
            });
            this.logger.log(`Admin ${actor.userId} rejected course ${course.id}`);
            return { course: this.mapCourse(course) };
        } catch (error: unknown) {
            const mapped = mapPrismaError(error);
            if (mapped) throw mapped;
            throw error;
        }
    }

    async getHistory(courseId: string, pagination: PaginationInput) {
        const window = getPaginationWindow(pagination);
        await this.prisma.course.findUniqueOrThrow({ where: { id: courseId }, select: { id: true } })
            .catch((error: unknown) => {
                throw new NotFoundException('Course not found');
            });
        const [reviews, total] = await this.prisma.$transaction([
            this.prisma.courseReview.findMany({
                where: { courseId },
                orderBy: { createdAt: 'desc' },
                skip: window.skip,
                take: window.take,
                select: {
                    id: true, courseId: true, decision: true, feedback: true,
                    previousStatus: true, newStatus: true, createdAt: true,
                    reviewer: { select: { id: true, name: true } },
                },
            }),
            this.prisma.courseReview.count({ where: { courseId } }),
        ]);
        return {
            items: reviews.map((review) => ({ ...review, reviewer: { id: review.reviewer.id, name: review.reviewer.name } })),
            meta: createPaginationMeta(window.page, window.limit, total),
        };
    }
}
