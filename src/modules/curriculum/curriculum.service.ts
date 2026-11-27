import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import {
    type CourseStatus,
    LessonType,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import { mapPrismaError } from '../../common/utils/prisma-error.util.js';
import { canEditCourse, courseTransaction } from '../courses/course-lifecycle.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import {
    AdminCreateCourseLessonInput,
    AdminCreateCourseSectionInput,
    AdminCreateLessonResourceInput,
    AdminMoveCourseLessonInput,
    AdminReorderCourseLessonsInput,
    AdminReorderCourseSectionsInput,
    AdminReorderLessonResourcesInput,
    AdminUpdateCourseLessonInput,
    AdminUpdateCourseSectionInput,
    AdminUpdateLessonResourceInput,
} from './dto/curriculum.inputs.js';

function validateSafeUrl(value: string): void {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new BadRequestException('Invalid URL');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new BadRequestException('Only HTTP(S) URLs are allowed');
    }
}

@Injectable()
export class CurriculumService {
    private readonly logger = new Logger(CurriculumService.name);
    constructor(private readonly prisma: PrismaService) {}

    private async assertCourseEditable(courseId: string, transaction: Prisma.TransactionClient) {
        // Coordinate curriculum writes with lifecycle updates to this course row.
        const [course] = await transaction.$queryRaw<{ status: CourseStatus }[]>`
            SELECT "status"::text AS status FROM "courses" WHERE "id" = ${courseId}::uuid FOR UPDATE
        `;
        if (!course) throw new NotFoundException('Course not found');
        if (!canEditCourse(course.status)) {
            throw new ConflictException('Course curriculum cannot be edited in this lifecycle state');
        }
    }

    async getCurriculum(courseId: string) {
        const course = await this.prisma.course.findUnique({
            where: { id: courseId },
            select: {
                id: true,
                sections: {
                    orderBy: { position: 'asc' },
                    select: {
                        id: true, courseId: true, title: true, description: true, position: true,
                        createdAt: true, updatedAt: true,
                        lessons: {
                            orderBy: { position: 'asc' },
                            select: {
                                id: true, sectionId: true, title: true, description: true, type: true,
                                content: true, videoUrl: true, documentUrl: true, durationSeconds: true,
                                position: true, isPreview: true, createdAt: true, updatedAt: true,
                                resources: {
                                    orderBy: { position: 'asc' },
                                    select: {
                                        id: true, title: true, type: true, url: true, fileName: true,
                                        fileSize: true, position: true, createdAt: true, updatedAt: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!course) throw new NotFoundException('Course not found');
        return { courseId: course.id, sections: course.sections };
    }

    async getStats(courseId: string) {
        const course = await this.prisma.course.findUnique({
            where: { id: courseId },
            select: {
                sections: {
                    select: {
                        lessons: {
                            select: { type: true, durationSeconds: true, isPreview: true },
                        },
                    },
                },
            },
        });
        if (!course) throw new NotFoundException('Course not found');
        const lessons = course.sections.flatMap((section) => section.lessons);
        return {
            totalSections: course.sections.length,
            totalLessons: lessons.length,
            totalVideoLessons: lessons.filter((lesson) => lesson.type === LessonType.VIDEO).length,
            totalTextLessons: lessons.filter((lesson) => lesson.type === LessonType.TEXT).length,
            totalPdfLessons: lessons.filter((lesson) => lesson.type === LessonType.PDF).length,
            totalDurationSeconds: lessons.reduce((total, lesson) => total + (lesson.durationSeconds ?? 0), 0),
            totalPreviewLessons: lessons.filter((lesson) => lesson.isPreview).length,
        };
    }

    async getCurriculumBySection(sectionId: string) {
        const section = await this.prisma.courseSection.findUnique({
            where: { id: sectionId },
            select: {
                id: true, courseId: true, title: true, description: true, position: true,
                createdAt: true, updatedAt: true,
                lessons: {
                    orderBy: { position: 'asc' },
                    select: {
                        id: true, sectionId: true, title: true, description: true, type: true,
                        content: true, videoUrl: true, documentUrl: true, durationSeconds: true,
                        position: true, isPreview: true, createdAt: true, updatedAt: true,
                        resources: { orderBy: { position: 'asc' } },
                    },
                },
            },
        });
        if (!section) throw new NotFoundException('Course section not found');
        return section;
    }

    async getLesson(lessonId: string) {
        const lesson = await this.prisma.courseLesson.findUnique({
            where: { id: lessonId },
            select: {
                id: true, sectionId: true, title: true, description: true, type: true,
                content: true, videoUrl: true, documentUrl: true, durationSeconds: true,
                position: true, isPreview: true, createdAt: true, updatedAt: true,
                resources: { orderBy: { position: 'asc' } },
            },
        });
        if (!lesson) throw new NotFoundException('Course lesson not found');
        return lesson;
    }

    async createSection(input: AdminCreateCourseSectionInput, actor: AuthenticatedUser) {
        return courseTransaction(this.prisma, async (transaction) => {
            await this.assertCourseEditable(input.courseId, transaction);
            const count = await transaction.courseSection.count({ where: { courseId: input.courseId } });
            const section = await transaction.courseSection.create({
                data: {
                    courseId: input.courseId,
                    title: input.title.trim(),
                    description: input.description?.trim() ?? '',
                    position: count,
                },
                select: {
                    id: true, courseId: true, title: true, description: true, position: true,
                    createdAt: true, updatedAt: true,
                    lessons: {
                        orderBy: { position: 'asc' },
                        select: {
                            id: true, sectionId: true, title: true, description: true, type: true,
                            content: true, videoUrl: true, documentUrl: true, durationSeconds: true,
                            position: true, isPreview: true, createdAt: true, updatedAt: true,
                            resources: { orderBy: { position: 'asc' } },
                        },
                    },
                },
            });
            this.logger.log(`Admin ${actor.userId} created section ${section.id}`);
            return section;
        });
    }

    async updateSection(input: AdminUpdateCourseSectionInput) {
        return courseTransaction(this.prisma, async (transaction) => {
            const existing = await transaction.courseSection.findUnique({
                where: { id: input.id }, select: { id: true, courseId: true },
            });
            if (!existing) throw new NotFoundException('Course section not found');
            await this.assertCourseEditable(existing.courseId, transaction);
            if (input.title === undefined && input.description === undefined) {
                throw new BadRequestException('At least one section field must be provided');
            }
            return transaction.courseSection.update({
                where: { id: input.id },
                data: {
                    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
                    ...(input.description !== undefined ? { description: input.description.trim() } : {}),
                },
                select: {
                    id: true, courseId: true, title: true, description: true, position: true,
                    createdAt: true, updatedAt: true,
                    lessons: {
                        orderBy: { position: 'asc' },
                        select: {
                            id: true, sectionId: true, title: true, description: true, type: true,
                            content: true, videoUrl: true, documentUrl: true, durationSeconds: true,
                            position: true, isPreview: true, createdAt: true, updatedAt: true,
                            resources: { orderBy: { position: 'asc' } },
                        },
                    },
                },
            });
        });
    }

    async deleteSection(id: string) {
        return courseTransaction(this.prisma, async (transaction) => {
            const section = await transaction.courseSection.findUnique({
                where: { id }, select: { id: true, courseId: true, position: true, _count: { select: { lessons: true } } },
            });
            if (!section) throw new NotFoundException('Course section not found');
            await this.assertCourseEditable(section.courseId, transaction);
            if (section._count.lessons > 0) {
                throw new ConflictException('Section cannot be deleted while it contains lessons');
            }
            await transaction.courseSection.delete({ where: { id } });
            const remaining = await transaction.courseSection.findMany({
                where: { courseId: section.courseId },
                orderBy: { position: 'asc' },
                select: { id: true },
            });
            await Promise.all(remaining.map((item, position) =>
                transaction.courseSection.update({ where: { id: item.id }, data: { position } }),
            ));
            return { success: true, message: 'Course section deleted successfully' };
        });
    }

    async reorderSections(input: AdminReorderCourseSectionsInput) {
        return courseTransaction(this.prisma, async (transaction) => {
            await this.assertCourseEditable(input.courseId, transaction);
            const sections = await transaction.courseSection.findMany({
                where: { courseId: input.courseId }, select: { id: true },
            });
            const actual = sections.map((section) => section.id);
            const ids = input.orderedSectionIds;
            if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate section IDs are not allowed');
            if (actual.length !== ids.length || actual.some((id) => !ids.includes(id))) {
                throw new BadRequestException('Ordered list must include every section exactly once');
            }
            await Promise.all(ids.map((id, position) =>
                transaction.courseSection.updateMany({
                    where: { id, courseId: input.courseId },
                    data: { position: position + 1000000 },
                }),
            ));
            await Promise.all(ids.map((id, position) =>
                transaction.courseSection.updateMany({
                    where: { id, courseId: input.courseId },
                    data: { position },
                }),
            ));
            return { success: true, message: 'Course sections reordered successfully' };
        });
    }

    async createLesson(input: AdminCreateCourseLessonInput, actor: AuthenticatedUser) {
        return courseTransaction(this.prisma, async (transaction) => {
            const section = await transaction.courseSection.findUnique({
                where: { id: input.sectionId },
                select: { id: true, courseId: true },
            });
            if (!section) throw new NotFoundException('Course section not found');
            await this.assertCourseEditable(section.courseId, transaction);
            this.validateLesson(input.type, input.content, input.videoUrl, input.documentUrl, input.durationSeconds);
            if (input.videoUrl) validateSafeUrl(input.videoUrl);
            if (input.documentUrl) validateSafeUrl(input.documentUrl);
            const count = await transaction.courseLesson.count({ where: { sectionId: input.sectionId } });
            const lesson = await transaction.courseLesson.create({
                data: {
                    sectionId: input.sectionId,
                    title: input.title.trim(),
                    description: input.description?.trim() ?? '',
                    type: input.type,
                    content: input.content?.trim() ?? '',
                    videoUrl: input.videoUrl?.trim() || null,
                    documentUrl: input.documentUrl?.trim() || null,
                    durationSeconds: input.durationSeconds ?? null,
                    position: count,
                    isPreview: input.isPreview,
                },
                include: {
                    resources: { orderBy: { position: 'asc' } },
                },
            });
            this.logger.log(`Admin ${actor.userId} created lesson ${lesson.id}`);
            return lesson;
        });
    }

    private validateLesson(type: LessonType, content?: string, videoUrl?: string | null, documentUrl?: string | null, duration?: number | null) {
        if (type === LessonType.VIDEO && (videoUrl || duration !== undefined)) {
            if (videoUrl) validateSafeUrl(videoUrl);
            if (duration !== undefined && duration !== null && duration < 0) throw new BadRequestException('Duration must be non-negative');
        }
        if (type === LessonType.TEXT && content !== undefined && content.length > 10000) {
            throw new BadRequestException('Text content is too long');
        }
        if (type === LessonType.PDF && documentUrl) validateSafeUrl(documentUrl);
    }

    async updateLesson(input: AdminUpdateCourseLessonInput) {
        return courseTransaction(this.prisma, async (transaction) => {
            const existing = await transaction.courseLesson.findUnique({
                where: { id: input.id },
                select: { id: true, section: { select: { courseId: true } }, type: true, content: true,
                    videoUrl: true, documentUrl: true, durationSeconds: true },
            });
            if (!existing) throw new NotFoundException('Course lesson not found');
            await this.assertCourseEditable(existing.section.courseId, transaction);
            const type = input.type ?? existing.type;
            const content = input.content !== undefined ? input.content : existing.content;
            const videoUrl = input.videoUrl !== undefined ? input.videoUrl : existing.videoUrl;
            const documentUrl = input.documentUrl !== undefined ? input.documentUrl : existing.documentUrl;
            const duration = input.durationSeconds !== undefined ? input.durationSeconds : existing.durationSeconds;
            this.validateLesson(type, content, videoUrl, documentUrl, duration);
            const data: Prisma.CourseLessonUpdateInput = {
                ...(input.title !== undefined ? { title: input.title.trim() } : {}),
                ...(input.description !== undefined ? { description: input.description.trim() } : {}),
                ...(input.type !== undefined ? { type: input.type } : {}),
                ...(input.content !== undefined ? { content: input.content.trim() } : {}),
                ...(input.videoUrl !== undefined ? { videoUrl: input.videoUrl?.trim() || null } : {}),
                ...(input.documentUrl !== undefined ? { documentUrl: input.documentUrl?.trim() || null } : {}),
                ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
                ...(input.isPreview !== undefined ? { isPreview: input.isPreview } : {}),
            };
            if (input.type === LessonType.TEXT) { data.videoUrl = null; data.documentUrl = null; }
            if (input.type === LessonType.VIDEO) { data.documentUrl = null; data.content = ''; }
            if (input.type === LessonType.PDF) { data.videoUrl = null; data.content = ''; }
            try {
                return await transaction.courseLesson.update({
                    where: { id: input.id },
                    data,
                    include: { resources: { orderBy: { position: 'asc' } } },
                });
            } catch (error: unknown) {
                const mapped = mapPrismaError(error);
                if (mapped) throw mapped;
                throw error;
            }
        });
    }

    async deleteLesson(id: string) {
        return courseTransaction(this.prisma, async (transaction) => {
            const lesson = await transaction.courseLesson.findUnique({
                where: { id },
                select: { id: true, sectionId: true, position: true, section: { select: { courseId: true } } },
            });
            if (!lesson) throw new NotFoundException('Course lesson not found');
            await this.assertCourseEditable(lesson.section.courseId, transaction);
            await transaction.courseLesson.delete({ where: { id } });
            const remaining = await transaction.courseLesson.findMany({
                where: { sectionId: lesson.sectionId },
                orderBy: { position: 'asc' },
                select: { id: true },
            });
            await Promise.all(remaining.map((item, position) =>
                transaction.courseLesson.update({ where: { id: item.id }, data: { position } }),
            ));
            return { success: true, message: 'Course lesson deleted successfully' };
        });
    }

    async reorderLessons(input: AdminReorderCourseLessonsInput) {
        return courseTransaction(this.prisma, async (transaction) => {
            const section = await transaction.courseSection.findUnique({
                where: { id: input.sectionId }, select: { courseId: true },
            });
            if (!section) throw new NotFoundException('Course section not found');
            await this.assertCourseEditable(section.courseId, transaction);
            const lessons = await transaction.courseLesson.findMany({
                where: { sectionId: input.sectionId }, select: { id: true },
            });
            const ids = input.orderedLessonIds;
            if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate lesson IDs are not allowed');
            if (lessons.length !== ids.length || lessons.some((lesson) => !ids.includes(lesson.id))) {
                throw new BadRequestException('Ordered list must include every lesson exactly once');
            }
            await Promise.all(ids.map((id, position) =>
                transaction.courseLesson.updateMany({
                    where: { id, sectionId: input.sectionId }, data: { position: position + 1000000 },
                }),
            ));
            await Promise.all(ids.map((id, position) =>
                transaction.courseLesson.updateMany({
                    where: { id, sectionId: input.sectionId }, data: { position },
                }),
            ));
            return { success: true, message: 'Course lessons reordered successfully' };
        });
    }

    async moveLesson(input: AdminMoveCourseLessonInput) {
        return courseTransaction(this.prisma, async (transaction) => {
            const lesson = await transaction.courseLesson.findUnique({
                where: { id: input.lessonId },
                select: { id: true, sectionId: true, position: true, section: { select: { courseId: true } } },
            });
            if (!lesson) throw new NotFoundException('Course lesson not found');
            const destination = await transaction.courseSection.findUnique({
                where: { id: input.destinationSectionId },
                select: { id: true, courseId: true },
            });
            if (!destination) throw new NotFoundException('Destination section not found');
            if (destination.courseId !== lesson.section.courseId) {
                throw new BadRequestException('Lessons cannot be moved across courses');
            }
            await this.assertCourseEditable(lesson.section.courseId, transaction);
            if (lesson.sectionId === destination.id) throw new BadRequestException('Lesson is already in this section');
            const destinationCount = await transaction.courseLesson.count({ where: { sectionId: destination.id } });
            await transaction.courseLesson.update({
                where: { id: lesson.id },
                data: { sectionId: destination.id, position: destinationCount },
            });
            const sourceRemaining = await transaction.courseLesson.findMany({
                where: { sectionId: lesson.sectionId }, orderBy: { position: 'asc' }, select: { id: true },
            });
            const destinationRemaining = await transaction.courseLesson.findMany({
                where: { sectionId: destination.id }, orderBy: { position: 'asc' }, select: { id: true },
            });
            await Promise.all([
                ...sourceRemaining.map((item, position) =>
                    transaction.courseLesson.update({ where: { id: item.id }, data: { position } })),
                ...destinationRemaining.map((item, position) =>
                    transaction.courseLesson.update({ where: { id: item.id }, data: { position } })),
            ]);
            return { success: true, message: 'Course lesson moved successfully' };
        });
    }

    async findResources(lessonId: string) {
        const lesson = await this.prisma.courseLesson.findUnique({
            where: { id: lessonId },
            select: { resources: { orderBy: { position: 'asc' } } },
        });
        if (!lesson) throw new NotFoundException('Course lesson not found');
        return lesson.resources;
    }

    async createResource(input: AdminCreateLessonResourceInput) {
        return courseTransaction(this.prisma, async (transaction) => {
            const lesson = await transaction.courseLesson.findUnique({
                where: { id: input.lessonId },
                select: { id: true, section: { select: { courseId: true } } },
            });
            if (!lesson) throw new NotFoundException('Course lesson not found');
            await this.assertCourseEditable(lesson.section.courseId, transaction);
            validateSafeUrl(input.url);
            const count = await transaction.lessonResource.count({ where: { lessonId: input.lessonId } });
            return transaction.lessonResource.create({
                data: {
                    lessonId: input.lessonId,
                    title: input.title.trim(),
                    type: input.type,
                    url: input.url.trim(),
                    fileName: input.fileName?.trim() || null,
                    fileSize: input.fileSize ?? null,
                    position: count,
                },
            });
        });
    }

    async updateResource(input: AdminUpdateLessonResourceInput) {
        return courseTransaction(this.prisma, async (transaction) => {
            const existing = await transaction.lessonResource.findUnique({
                where: { id: input.id },
                select: { id: true, lesson: { select: { section: { select: { courseId: true } } } } },
            });
            if (!existing) throw new NotFoundException('Lesson resource not found');
            await this.assertCourseEditable(existing.lesson.section.courseId, transaction);
            if (input.url !== undefined) validateSafeUrl(input.url);
            if (input.title === undefined && input.type === undefined && input.url === undefined &&
                input.fileName === undefined && input.fileSize === undefined) {
                throw new BadRequestException('At least one resource field must be provided');
            }
            return transaction.lessonResource.update({
                where: { id: input.id },
                data: {
                    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
                    ...(input.type !== undefined ? { type: input.type } : {}),
                    ...(input.url !== undefined ? { url: input.url.trim() } : {}),
                    ...(input.fileName !== undefined ? { fileName: input.fileName?.trim() || null } : {}),
                    ...(input.fileSize !== undefined ? { fileSize: input.fileSize } : {}),
                },
            });
        });
    }

    async deleteResource(id: string) {
        return courseTransaction(this.prisma, async (transaction) => {
            const resource = await transaction.lessonResource.findUnique({
                where: { id },
                select: { id: true, lessonId: true, position: true, lesson: { select: { section: { select: { courseId: true } } } } },
            });
            if (!resource) throw new NotFoundException('Lesson resource not found');
            await this.assertCourseEditable(resource.lesson.section.courseId, transaction);
            await transaction.lessonResource.delete({ where: { id } });
            const remaining = await transaction.lessonResource.findMany({
                where: { lessonId: resource.lessonId }, orderBy: { position: 'asc' }, select: { id: true },
            });
            await Promise.all(remaining.map((item, position) =>
                transaction.lessonResource.update({ where: { id: item.id }, data: { position } }),
            ));
            return { success: true, message: 'Lesson resource deleted successfully' };
        });
    }

    async reorderResources(input: AdminReorderLessonResourcesInput) {
        return courseTransaction(this.prisma, async (transaction) => {
            const lesson = await transaction.courseLesson.findUnique({
                where: { id: input.lessonId },
                select: { section: { select: { courseId: true } } },
            });
            if (!lesson) throw new NotFoundException('Course lesson not found');
            await this.assertCourseEditable(lesson.section.courseId, transaction);
            const resources = await transaction.lessonResource.findMany({
                where: { lessonId: input.lessonId }, select: { id: true },
            });
            const ids = input.orderedResourceIds;
            if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate resource IDs are not allowed');
            if (resources.length !== ids.length || resources.some((resource) => !ids.includes(resource.id))) {
                throw new BadRequestException('Ordered list must include every resource exactly once');
            }
            await Promise.all(ids.map((id, position) =>
                transaction.lessonResource.updateMany({
                    where: { id, lessonId: input.lessonId }, data: { position: position + 1000000 },
                }),
            ));
            await Promise.all(ids.map((id, position) =>
                transaction.lessonResource.updateMany({
                    where: { id, lessonId: input.lessonId }, data: { position },
                }),
            ));
            return { success: true, message: 'Lesson resources reordered successfully' };
        });
    }
}
