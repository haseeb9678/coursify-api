import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';

import { Prisma } from '../../generated/prisma/client.js';
import {
    CategoryStatus,
    CourseLevel,
    CoursePricingType,
    CourseStatus,
    CourseReviewDecision,
    UserRole,
    UserStatus,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import { PaginationInput } from '../../common/pagination/pagination.input.js';
import { createPaginationMeta, getPaginationWindow } from '../../common/pagination/pagination.utils.js';
import { SortDirection } from '../../common/enums/sort-direction.enum.js';
import { mapPrismaError } from '../../common/utils/prisma-error.util.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import {
    AdminCoursesFilterInput,
    AdminCourseSortInput,
    AdminCreateCourseInput,
    AdminUpdateCourseInput,
    AdminUpdateCourseFeaturedInput,
} from './dto/course.inputs.js';
import { assertCourseStatus, assertCourseTransition, canDeleteCourse, canEditCourse, courseTransaction } from './course-lifecycle.js';
import { AdminCourseSortField } from './enums/course.enums.js';

function normalizeSlug(value: string): string {
    return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 200);
}

function validatePrice(pricingType: CoursePricingType, price: number, discounted: number | null | undefined): void {
    if (pricingType === CoursePricingType.FREE) {
        if (price !== 0 || discounted != null) {
            throw new BadRequestException('Free courses must have a zero price and no discounted price');
        }
        return;
    }
    if (price <= 0) {
        throw new BadRequestException('Paid courses must have a price greater than zero');
    }
    if (discounted !== undefined && discounted !== null) {
        if (discounted <= 0) throw new BadRequestException('Discounted price must be positive');
        if (discounted >= price) throw new BadRequestException('Discounted price must be lower than the regular price');
    }
}

@Injectable()
export class CoursesService {
    private readonly logger = new Logger(CoursesService.name);
    constructor(private readonly prisma: PrismaService) {}

    private async mapCourse(course: {
        id: string; title: string; slug: string; shortDescription: string; description: string;
        thumbnailUrl: string | null; promotionalVideoUrl: string | null;
        category: { id: string; name: string; slug: string };
        instructor: { id: string; name: string; avatar: string | null };
        level: CourseLevel; language: string; pricingType: CoursePricingType;
        priceMinorUnits: number; discountedPriceMinorUnits: number | null;
        currency: string; learningOutcomes: string[]; requirements: string[]; targetAudience: string[];
        status: CourseStatus; isFeatured: boolean; submittedAt: Date | null; approvedAt: Date | null;
        publishedAt: Date | null; archivedAt: Date | null; createdAt: Date; updatedAt: Date;
        sections: Array<{ _count: { lessons: number } }>;
        _count: { reviews: number };
    }) {
        return {
            id: course.id,
            title: course.title,
            slug: course.slug,
            shortDescription: course.shortDescription,
            description: course.description,
            thumbnailUrl: course.thumbnailUrl,
            promotionalVideoUrl: course.promotionalVideoUrl,
            category: course.category,
            instructor: course.instructor,
            level: course.level,
            language: course.language,
            pricing: {
                type: course.pricingType,
                currency: course.currency,
                priceMinorUnits: course.priceMinorUnits,
                discountedPriceMinorUnits: course.discountedPriceMinorUnits,
            },
            learningOutcomes: course.learningOutcomes,
            requirements: course.requirements,
            targetAudience: course.targetAudience,
            status: course.status,
            isFeatured: course.isFeatured,
            canDelete: canDeleteCourse(course.status, course._count.reviews),
            sectionCount: course.sections.length,
            lessonCount: course.sections.reduce((total, section) => total + section._count.lessons, 0),
            submittedAt: course.submittedAt,
            approvedAt: course.approvedAt,
            publishedAt: course.publishedAt,
            archivedAt: course.archivedAt,
            createdAt: course.createdAt,
            updatedAt: course.updatedAt,
        };
    }

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
        sections: { select: { _count: { select: { lessons: true } } } },
        _count: { select: { reviews: true } },
    } as const;

    async findCourses(pagination: PaginationInput, filter?: AdminCoursesFilterInput, sort?: AdminCourseSortInput) {
        const window = getPaginationWindow(pagination);
        const search = filter?.search?.trim();
        const where: Prisma.CourseWhereInput = {};
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { slug: { contains: search, mode: 'insensitive' } },
                { instructor: { name: { contains: search, mode: 'insensitive' } } },
            ];
        }
        if (filter?.categoryId) where.categoryId = filter.categoryId;
        if (filter?.instructorId) where.instructorId = filter.instructorId;
        if (filter?.status) where.status = filter.status;
        if (filter?.level) where.level = filter.level;
        if (filter?.language) where.language = { equals: filter.language, mode: 'insensitive' };
        if (filter?.pricingType) where.pricingType = filter.pricingType;
        if (filter?.isFeatured !== undefined) where.isFeatured = filter.isFeatured;
        if (filter?.minPriceMinorUnits !== undefined || filter?.maxPriceMinorUnits !== undefined) {
            where.priceMinorUnits = {
                ...(filter.minPriceMinorUnits !== undefined ? { gte: filter.minPriceMinorUnits } : {}),
                ...(filter.maxPriceMinorUnits !== undefined ? { lte: filter.maxPriceMinorUnits } : {}),
            };
        }
        if (filter?.minPriceMinorUnits !== undefined && filter?.maxPriceMinorUnits !== undefined &&
            filter.minPriceMinorUnits > filter.maxPriceMinorUnits) {
            throw new BadRequestException('Minimum price must not exceed maximum price');
        }
        const direction = sort?.direction === SortDirection.ASC ? 'asc' : 'desc';
        let orderBy: Prisma.CourseOrderByWithRelationInput;
        switch (sort?.field) {
            case AdminCourseSortField.TITLE: orderBy = { title: direction }; break;
            case AdminCourseSortField.PRICE: orderBy = { priceMinorUnits: direction }; break;
            case AdminCourseSortField.UPDATED_AT: orderBy = { updatedAt: direction }; break;
            case AdminCourseSortField.PUBLISHED_AT: orderBy = { publishedAt: direction }; break;
            case AdminCourseSortField.CREATED_AT:
            default: orderBy = { createdAt: direction };
        }
        const [courses, total] = await this.prisma.$transaction([
            this.prisma.course.findMany({
                where, orderBy: [orderBy, { id: 'asc' }], skip: window.skip, take: window.take,
                select: this.courseSelect,
            }),
            this.prisma.course.count({ where }),
        ]);
        return {
            items: await Promise.all(courses.map((course) => this.mapCourse(course))),
            meta: createPaginationMeta(window.page, window.limit, total),
        };
    }

    async findCourse(id: string) {
        const course = await this.prisma.course.findUnique({ where: { id }, select: this.courseSelect });
        if (!course) throw new NotFoundException('Course not found');
        return this.mapCourse(course);
    }

    async getStats() {
        const [counts, freeCourses, paidCourses] = await this.prisma.$transaction([
            this.prisma.course.groupBy({ by: ['status'], _count: { _all: true } }),
            this.prisma.course.count({ where: { pricingType: CoursePricingType.FREE } }),
            this.prisma.course.count({ where: { pricingType: CoursePricingType.PAID } }),
        ]);
        const find = (status: CourseStatus) => counts.find((item) => item.status === status)?._count._all ?? 0;
        return {
            totalCourses: counts.reduce((total, item) => total + item._count._all, 0),
            draftCourses: find(CourseStatus.DRAFT),
            pendingReviewCourses: find(CourseStatus.PENDING_REVIEW),
            approvedCourses: find(CourseStatus.APPROVED),
            rejectedCourses: find(CourseStatus.REJECTED),
            publishedCourses: find(CourseStatus.PUBLISHED),
            archivedCourses: find(CourseStatus.ARCHIVED),
            freeCourses,
            paidCourses,
        };
    }

    async getInstructorOptions(search?: string) {
        const trimmed = search?.trim();
        return this.prisma.user.findMany({
            where: {
                role: UserRole.INSTRUCTOR,
                status: UserStatus.ACTIVE,
                ...(trimmed ? { name: { contains: trimmed, mode: 'insensitive' } } : {}),
            },
            select: { id: true, name: true, avatar: true },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            take: 100,
        });
    }

    async getCategoryOptions(search?: string) {
        const trimmed = search?.trim();
        return this.prisma.category.findMany({
            where: {
                status: CategoryStatus.ACTIVE,
                ...(trimmed ? { name: { contains: trimmed, mode: 'insensitive' } } : {}),
            },
            select: { id: true, name: true, slug: true },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            take: 100,
        });
    }

    private async assertCategoryAndInstructor(categoryId: string, instructorId: string, database: Prisma.TransactionClient = this.prisma) {
        const [category, instructor] = await Promise.all([
            database.category.findUnique({ where: { id: categoryId }, select: { id: true, status: true } }),
            database.user.findUnique({ where: { id: instructorId }, select: { id: true, role: true, status: true } }),
        ]);
        if (!category) throw new NotFoundException('Category not found');
        if (category.status !== CategoryStatus.ACTIVE) throw new BadRequestException('Category is inactive');
        if (!instructor) throw new NotFoundException('Instructor not found');
        if (instructor.role !== UserRole.INSTRUCTOR || instructor.status !== UserStatus.ACTIVE) {
            throw new BadRequestException('The selected user is not an active instructor');
        }
    }

    async createCourse(input: AdminCreateCourseInput, actor: AuthenticatedUser) {
        validatePrice(input.pricingType, input.priceMinorUnits, input.discountedPriceMinorUnits);
        await this.assertCategoryAndInstructor(input.categoryId, input.instructorId);
        const slug = normalizeSlug(input.slug ?? input.title);
        if (!slug) throw new BadRequestException('A valid course slug is required');
        try {
            const course = await this.prisma.course.create({
                data: {
                    title: input.title.trim(),
                    slug,
                    shortDescription: input.shortDescription?.trim() ?? '',
                    description: input.description?.trim() ?? '',
                    thumbnailUrl: input.thumbnailUrl?.trim() || null,
                    promotionalVideoUrl: input.promotionalVideoUrl?.trim() || null,
                    categoryId: input.categoryId,
                    instructorId: input.instructorId,
                    createdById: actor.userId,
                    level: input.level ?? CourseLevel.BEGINNER,
                    language: input.language?.trim() || 'English',
                    pricingType: input.pricingType,
                    priceMinorUnits: input.priceMinorUnits,
                    discountedPriceMinorUnits: input.discountedPriceMinorUnits ?? null,
                    currency: input.currency ?? 'USD',
                    learningOutcomes: input.learningOutcomes?.map((item) => item.trim()).filter(Boolean) ?? [],
                    requirements: input.requirements?.map((item) => item.trim()).filter(Boolean) ?? [],
                    targetAudience: input.targetAudience?.map((item) => item.trim()).filter(Boolean) ?? [],
                    status: CourseStatus.DRAFT,
                },
                select: this.courseSelect,
            });
            this.logger.log(`Admin ${actor.userId} created course ${course.id}`);
            return this.mapCourse(course);
        } catch (error: unknown) {
            const mapped = mapPrismaError(error);
            if (mapped) throw mapped;
            throw error;
        }
    }

    async updateCourse(input: AdminUpdateCourseInput) {
        return courseTransaction(this.prisma, async (transaction) => {
            const existing = await transaction.course.findUnique({ where: { id: input.id }, select: this.courseSelect });
            if (!existing) throw new NotFoundException('Course not found');

            const text = (value?: string) => value?.trim();
            const media = (value?: string | null) => value === undefined ? undefined : value?.trim() || null;
            const list = (values?: string[]) => values?.map((value) => value.trim()).filter(Boolean);
            const changes = {
                title: text(input.title),
                slug: input.slug == null ? undefined : normalizeSlug(input.slug),
                shortDescription: text(input.shortDescription),
                description: text(input.description),
                categoryId: input.categoryId ?? undefined,
                instructorId: input.instructorId ?? undefined,
                level: input.level ?? undefined,
                language: text(input.language),
                pricingType: input.pricingType ?? undefined,
                priceMinorUnits: input.priceMinorUnits ?? undefined,
                discountedPriceMinorUnits: input.discountedPriceMinorUnits,
                currency: text(input.currency),
                thumbnailUrl: media(input.thumbnailUrl),
                promotionalVideoUrl: media(input.promotionalVideoUrl),
                learningOutcomes: list(input.learningOutcomes),
                requirements: list(input.requirements),
                targetAudience: list(input.targetAudience),
            };
            const stored = {
                ...existing,
                title: text(existing.title),
                shortDescription: text(existing.shortDescription),
                description: text(existing.description),
                language: text(existing.language),
                thumbnailUrl: media(existing.thumbnailUrl),
                promotionalVideoUrl: media(existing.promotionalVideoUrl),
                learningOutcomes: list(existing.learningOutcomes),
                requirements: list(existing.requirements),
                targetAudience: list(existing.targetAudience),
                categoryId: existing.category.id,
                instructorId: existing.instructor.id,
            };
            for (const key of Object.keys(changes) as (keyof typeof changes)[]) {
                if (changes[key] === undefined || JSON.stringify(changes[key]) === JSON.stringify(stored[key])) delete changes[key];
            }
            if (Object.keys(changes).length === 0) return this.mapCourse(existing);
            if (!canEditCourse(existing.status)) {
                throw new ConflictException('Material course content cannot be edited in this lifecycle state');
            }
            if (changes.categoryId || changes.instructorId) {
                await this.assertCategoryAndInstructor(
                    changes.categoryId ?? existing.category.id,
                    changes.instructorId ?? existing.instructor.id,
                    transaction,
                );
            }
            if (
                changes.pricingType !== undefined || changes.priceMinorUnits !== undefined ||
                changes.discountedPriceMinorUnits !== undefined
            ) {
                validatePrice(
                    changes.pricingType ?? existing.pricingType,
                    changes.priceMinorUnits ?? existing.priceMinorUnits,
                    changes.discountedPriceMinorUnits === undefined
                        ? existing.discountedPriceMinorUnits
                        : changes.discountedPriceMinorUnits,
                );
            }
            try {
                const course = await transaction.course.update({
                    where: { id: input.id, status: existing.status },
                    data: changes,
                    select: this.courseSelect,
                });
                return this.mapCourse(course);
            } catch (error: unknown) {
                throw mapPrismaError(error) ?? error;
            }
        });
    }

    async deleteCourse(id: string) {
        return courseTransaction(this.prisma, async (transaction) => {
            const course = await transaction.course.findUnique({
                where: { id }, select: { status: true, _count: { select: { reviews: true } } },
            });
            if (!course) throw new NotFoundException('Course not found');
            if (!canDeleteCourse(course.status, course._count.reviews)) {
                throw new ConflictException('Only drafts without review history can be deleted');
            }
            await transaction.course.delete({ where: { id, status: CourseStatus.DRAFT } });
            return { success: true, message: 'Course deleted successfully' };
        });
    }

    async updateFeatured(input: AdminUpdateCourseFeaturedInput) {
        const course = await this.prisma.course.update({
            where: { id: input.id },
            data: { isFeatured: input.isFeatured },
            select: this.courseSelect,
        }).catch((error: unknown) => {
            const mapped = mapPrismaError(error);
            if (mapped) throw mapped;
            throw error;
        });
        return this.mapCourse(course);
    }

    async submitCourse(id: string) {
        return this.transitionCourse(id, CourseStatus.PENDING_REVIEW, { submittedAt: new Date(), approvedAt: null });
    }

    async withdrawSubmission(id: string) {
        return this.transitionCourse(id, CourseStatus.DRAFT, { submittedAt: null, approvedAt: null }, CourseStatus.PENDING_REVIEW);
    }

    async publishCourse(id: string) {
        return this.transitionCourse(id, CourseStatus.PUBLISHED, { publishedAt: new Date(), archivedAt: null });
    }

    async archiveCourse(id: string) {
        return this.transitionCourse(id, CourseStatus.ARCHIVED, { archivedAt: new Date() });
    }

    async restoreCourse(id: string, expectedStatus?: CourseStatus) {
        return this.transitionCourse(id, CourseStatus.DRAFT, {
            archivedAt: null, publishedAt: null, submittedAt: null, approvedAt: null,
        }, expectedStatus, true);
    }

    private async transitionCourse(
        id: string,
        destination: CourseStatus,
        dates: Pick<Prisma.CourseUpdateInput, 'submittedAt' | 'approvedAt' | 'publishedAt' | 'archivedAt'>,
        expectedStatus?: CourseStatus,
        restoring = false,
    ) {
        return courseTransaction(this.prisma, async (transaction) => {
            const course = await transaction.course.findUnique({ where: { id }, select: this.courseSelect });
            if (!course) throw new NotFoundException('Course not found');
            assertCourseStatus(course.status, expectedStatus);
            if (restoring && (
                course.status === CourseStatus.PENDING_REVIEW ||
                (course.status === CourseStatus.PUBLISHED && expectedStatus !== CourseStatus.PUBLISHED)
            )) {
                throw new ConflictException('Withdraw pending submissions or explicitly confirm unpublishing a published course.');
            }
            assertCourseTransition(course.status, destination, `A course in ${course.status} cannot move to ${destination}`);
            if (destination === CourseStatus.PENDING_REVIEW || destination === CourseStatus.PUBLISHED) {
                const sections = await transaction.courseSection.findMany({
                    where: { courseId: id },
                    orderBy: { position: 'asc' },
                    select: {
                        lessons: {
                            select: { title: true, type: true, content: true, videoUrl: true, documentUrl: true, durationSeconds: true },
                            orderBy: { position: 'asc' },
                        },
                    },
                });
                this.validateReadiness({ ...course, sections });
            }
            const updated = await transaction.course.update({
                where: { id, status: course.status },
                data: { ...dates, status: destination },
                select: this.courseSelect,
            });
            return this.mapCourse(updated);
        });
    }

    private validateReadiness(course: {
        title: string; description: string; thumbnailUrl: string | null;
        category: { status?: CategoryStatus } | null;
        instructor: { status?: UserStatus; role?: UserRole } | null;
        pricingType: CoursePricingType; priceMinorUnits: number;
        discountedPriceMinorUnits: number | null; learningOutcomes: string[];
        sections: Array<{ lessons: Array<{ title: string; type: string; content: string; videoUrl: string | null; documentUrl: string | null; durationSeconds: number | null }> }>;
    }) {
        const errors: string[] = [];
        if (course.title.trim().length < 2) errors.push('Course title is required');
        if (course.description.trim().length < 20) errors.push('Course description must be at least 20 characters');
        if (!course.thumbnailUrl) errors.push('A thumbnail is required');
        if (course.category?.status !== CategoryStatus.ACTIVE) errors.push('An active category is required');
        if (!course.instructor || course.instructor.role !== UserRole.INSTRUCTOR || course.instructor.status !== UserStatus.ACTIVE) {
            errors.push('An active instructor is required');
        }
        validatePrice(course.pricingType, course.priceMinorUnits, course.discountedPriceMinorUnits);
        if (course.learningOutcomes.length === 0) errors.push('At least one learning outcome is required');
        if (course.sections.length === 0) errors.push('At least one curriculum section is required');
        for (const section of course.sections) {
            if (section.lessons.length === 0) errors.push('Every section must contain at least one lesson');
            for (const lesson of section.lessons) {
                if (lesson.title.trim().length < 2) errors.push('Every lesson requires a title');
                if (lesson.type === 'VIDEO' && (!lesson.videoUrl || (lesson.durationSeconds ?? 0) <= 0)) {
                    errors.push(`Video lesson "${lesson.title}" requires a video URL and duration`);
                }
                if (lesson.type === 'TEXT' && lesson.content.trim().length < 20) {
                    errors.push(`Text lesson "${lesson.title}" requires text content`);
                }
                if (lesson.type === 'PDF' && !lesson.documentUrl) {
                    errors.push(`PDF lesson "${lesson.title}" requires a document URL`);
                }
            }
        }
        if (errors.length > 0) throw new BadRequestException(`Course is not ready for review: ${errors.join('; ')}`);
    }

    async findPublicCourses(pagination: PaginationInput, filter?: AdminCoursesFilterInput) {
        const window = getPaginationWindow(pagination);
        const search = filter?.search?.trim();
        const where: Prisma.CourseWhereInput = {
            status: CourseStatus.PUBLISHED,
            category: { status: CategoryStatus.ACTIVE },
            instructor: { role: UserRole.INSTRUCTOR, status: UserStatus.ACTIVE },
        };
        if (search) where.OR = [
            { title: { contains: search, mode: 'insensitive' } },
            { slug: { contains: search, mode: 'insensitive' } },
        ];
        if (filter?.categoryId) where.categoryId = filter.categoryId;
        if (filter?.level) where.level = filter.level;
        if (filter?.language) where.language = { equals: filter.language, mode: 'insensitive' };
        if (filter?.pricingType) where.pricingType = filter.pricingType;
        if (filter?.minPriceMinorUnits !== undefined || filter?.maxPriceMinorUnits !== undefined) {
            where.priceMinorUnits = {
                ...(filter.minPriceMinorUnits !== undefined ? { gte: filter.minPriceMinorUnits } : {}),
                ...(filter.maxPriceMinorUnits !== undefined ? { lte: filter.maxPriceMinorUnits } : {}),
            };
        }
        const [courses, total] = await this.prisma.$transaction([
            this.prisma.course.findMany({
                where, orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
                skip: window.skip, take: window.take,
                select: this.courseSelect,
            }),
            this.prisma.course.count({ where }),
        ]);
        return {
            items: await Promise.all(courses.map((course) => this.mapPublicCourse(course))),
            meta: createPaginationMeta(window.page, window.limit, total),
        };
    }

    private async mapPublicCourse(course: {
        id: string; title: string; slug: string; shortDescription: string; description: string;
        thumbnailUrl: string | null; promotionalVideoUrl: string | null;
        category: { id: string; name: string; slug: string };
        instructor: { id: string; name: string; avatar: string | null };
        level: CourseLevel; language: string; pricingType: CoursePricingType;
        priceMinorUnits: number; discountedPriceMinorUnits: number | null; currency: string;
        learningOutcomes: string[]; requirements: string[]; targetAudience: string[]; updatedAt: Date;
    }) {
        return {
            id: course.id, title: course.title, slug: course.slug,
            shortDescription: course.shortDescription, description: course.description,
            thumbnailUrl: course.thumbnailUrl, promotionalVideoUrl: course.promotionalVideoUrl,
            category: course.category, instructor: course.instructor, level: course.level,
            language: course.language,
            pricing: { type: course.pricingType, currency: course.currency,
                priceMinorUnits: course.priceMinorUnits, discountedPriceMinorUnits: course.discountedPriceMinorUnits },
            learningOutcomes: course.learningOutcomes, requirements: course.requirements,
            targetAudience: course.targetAudience,
            updatedAt: course.updatedAt,
        };
    }

    async findPublicCourse(identifier: string) {
        const course = await this.prisma.course.findFirst({
            where: {
                OR: isUUID(identifier) ? [{ id: identifier }, { slug: identifier }] : [{ slug: identifier }],
                status: CourseStatus.PUBLISHED,
                category: { status: CategoryStatus.ACTIVE },
                instructor: { role: UserRole.INSTRUCTOR, status: UserStatus.ACTIVE },
            },
            select: {
                ...this.courseSelect,
                sections: {
                    orderBy: { position: 'asc' },
                    select: {
                        title: true,
                        lessons: {
                            orderBy: { position: 'asc' },
                            select: {
                                title: true, durationSeconds: true, isPreview: true,
                                _count: { select: { resources: true } },
                            },
                        },
                    },
                },
            },
        });
        if (!course) throw new NotFoundException('Published course not found');

        return {
            ...await this.mapPublicCourse(course),
            curriculum: course.sections.map(({ title, lessons }) => ({
                title,
                lessons: lessons.map(({ title, durationSeconds, isPreview, _count }) => ({
                    title, durationSeconds, isPreview, resourceCount: _count.resources,
                })),
            })),
        };
    }

    async findFeaturedCourses(limit: number) {
        const bounded = Math.min(Math.max(Number.isInteger(limit) ? limit : 6, 1), 20);
        const courses = await this.prisma.course.findMany({
            where: {
                status: CourseStatus.PUBLISHED,
                isFeatured: true,
                category: { status: CategoryStatus.ACTIVE },
                instructor: { role: UserRole.INSTRUCTOR, status: UserStatus.ACTIVE },
            },
            orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
            take: bounded,
            select: this.courseSelect,
        });
        return Promise.all(courses.map((course) => this.mapPublicCourse(course)));
    }

    async findRelatedCourses(courseId: string, limit: number) {
        const bounded = Math.min(Math.max(Number.isInteger(limit) ? limit : 6, 1), 20);
        const course = await this.prisma.course.findUnique({
            where: { id: courseId }, select: { categoryId: true },
        });
        if (!course) throw new NotFoundException('Course not found');
        const courses = await this.prisma.course.findMany({
            where: {
                id: { not: courseId },
                categoryId: course.categoryId,
                status: CourseStatus.PUBLISHED,
                category: { status: CategoryStatus.ACTIVE },
                instructor: { role: UserRole.INSTRUCTOR, status: UserStatus.ACTIVE },
            },
            orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
            take: bounded,
            select: this.courseSelect,
        });
        return Promise.all(courses.map((item) => this.mapPublicCourse(item)));
    }
}
