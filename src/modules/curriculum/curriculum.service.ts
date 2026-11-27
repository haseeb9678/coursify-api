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
import { privateAssetForAttachment } from '../storage/storage.service.js';
import {
    AdminCreateCourseLessonInput,
    AdminCreateCourseSectionInput,
    AdminCreateLessonResourceInput,
    AdminMoveCourseLessonInput,
    AdminReorderCourseLessonsInput,
    AdminReorderCourseSectionsInput,
    AdminReorderLessonResourcesInput,
    AdminSaveCourseLessonInput,
    LessonVideoQualityInput,
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
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password ||
        [...url.searchParams.keys()].some((key) => key.toLowerCase().startsWith('x-amz-'))) {
        throw new BadRequestException('Enter a public HTTPS link.');
    }
}

@Injectable()
export class CurriculumService {
    private readonly logger = new Logger(CurriculumService.name);
    constructor(private readonly prisma: PrismaService) {}

    private write<T>(transaction: Prisma.TransactionClient | undefined, work: (client: Prisma.TransactionClient) => Promise<T>) {
        return transaction ? work(transaction) : courseTransaction(this.prisma, work);
    }

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
                                content: true, videoUrl: true, documentUrl: true, videoAssetId: true, documentAssetId: true, durationSeconds: true,
                                videoQualities: { orderBy: { height: 'asc' } },
                                position: true, isPreview: true, createdAt: true, updatedAt: true,
                                resources: {
                                    orderBy: { position: 'asc' },
                                    select: {
                                        id: true, title: true, type: true, url: true, fileName: true,
                                        fileSize: true, mediaAssetId: true, position: true, createdAt: true, updatedAt: true,
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
                        content: true, videoUrl: true, documentUrl: true, videoAssetId: true, documentAssetId: true, durationSeconds: true,
                        videoQualities: { orderBy: { height: 'asc' } },
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
                content: true, videoUrl: true, documentUrl: true, videoAssetId: true, documentAssetId: true, durationSeconds: true,
                videoQualities: { orderBy: { height: 'asc' } },
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

    async createLesson(input: AdminCreateCourseLessonInput, actor: AuthenticatedUser, tx?: Prisma.TransactionClient) {
        return this.write(tx, async (transaction) => {
            const section = await transaction.courseSection.findUnique({
                where: { id: input.sectionId },
                select: { id: true, courseId: true },
            });
            if (!section) throw new NotFoundException('Course section not found');
            await this.assertCourseEditable(section.courseId, transaction);
            if (input.videoUrl || input.documentUrl) throw new BadRequestException('Upload new lesson files directly from your device.');
            this.validateLesson(input.type, input.content, input.durationSeconds);
            const media = await this.lessonAsset(transaction, input.type, input.mediaAssetId, actor.userId, section.courseId);
            const count = await transaction.courseLesson.count({ where: { sectionId: input.sectionId } });
            const lesson = await transaction.courseLesson.create({
                data: {
                    sectionId: input.sectionId,
                    title: input.title.trim(),
                    description: input.description?.trim() ?? '',
                    type: input.type,
                    content: input.content?.trim() ?? '',
                    videoAssetId: input.type === 'VIDEO' ? media?.id : null,
                    documentAssetId: input.type === 'PDF' ? media?.id : null,
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

    private validateLesson(type: LessonType, content?: string, duration?: number | null) {
        if (type === LessonType.VIDEO && duration != null && duration < 0) throw new BadRequestException('Duration must be non-negative');
        if (type === LessonType.TEXT && content !== undefined && content.length > 10000) {
            throw new BadRequestException('Text content is too long');
        }
    }

    private lessonAsset(tx: Prisma.TransactionClient, type: LessonType, assetId: string | undefined, userId: string, courseId: string) {
        if (type === 'TEXT') {
            if (assetId) throw new BadRequestException('Text lessons do not have a primary file.');
            return null;
        }
        if (!assetId) throw new BadRequestException(type === 'VIDEO' ? 'Upload a verified MP4 video.' : 'Upload a verified PDF.');
        return privateAssetForAttachment(tx, assetId, userId, courseId, type === 'VIDEO' ? 'LESSON_VIDEO' : 'LESSON_DOCUMENT');
    }

    async updateLesson(input: AdminUpdateCourseLessonInput, actor: AuthenticatedUser, tx?: Prisma.TransactionClient) {
        return this.write(tx, async (transaction) => {
            const existing = await transaction.courseLesson.findUnique({
                where: { id: input.id },
                select: { id: true, section: { select: { courseId: true } }, type: true, content: true,
                    videoUrl: true, documentUrl: true, videoAssetId: true, documentAssetId: true, durationSeconds: true },
            });
            if (!existing) throw new NotFoundException('Course lesson not found');
            await this.assertCourseEditable(existing.section.courseId, transaction);
            const type = input.type ?? existing.type;
            const content = input.content !== undefined ? input.content : existing.content;
            const videoUrl = type === 'VIDEO' && type === existing.type ? existing.videoUrl : null;
            const documentUrl = type === 'PDF' && type === existing.type ? existing.documentUrl : null;
            if ((input.videoUrl && input.videoUrl.trim() !== videoUrl) || (input.documentUrl && input.documentUrl.trim() !== documentUrl)) {
                throw new BadRequestException('Replace lesson media with a verified local upload.');
            }
            const currentAssetId = type === 'VIDEO' ? existing.videoAssetId : type === 'PDF' ? existing.documentAssetId : null;
            const media = (input.mediaAssetId && input.mediaAssetId !== currentAssetId) || (type !== 'TEXT' && type !== existing.type)
                ? await this.lessonAsset(transaction, type, input.mediaAssetId, actor.userId, existing.section.courseId) : null;
            const duration = input.durationSeconds !== undefined ? input.durationSeconds : existing.durationSeconds;
            this.validateLesson(type, content, duration);
            const data: Prisma.CourseLessonUncheckedUpdateInput = {
                ...(input.title !== undefined ? { title: input.title.trim() } : {}),
                ...(input.description !== undefined ? { description: input.description.trim() } : {}),
                ...(input.type !== undefined ? { type: input.type } : {}),
                ...(input.content !== undefined ? { content: input.content.trim() } : {}),
                ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
                ...(input.isPreview !== undefined ? { isPreview: input.isPreview } : {}),
            };
            if (media) {
                data.videoUrl = null;
                data.documentUrl = null;
                data.videoAssetId = type === 'VIDEO' ? media.id : null;
                data.documentAssetId = type === 'PDF' ? media.id : null;
            }
            if (input.type === LessonType.TEXT) { data.videoUrl = null; data.documentUrl = null; }
            if (input.type === LessonType.VIDEO) { data.documentUrl = null; data.content = ''; }
            if (input.type === LessonType.PDF) { data.videoUrl = null; data.content = ''; }
            if (type !== 'VIDEO') data.videoAssetId = null;
            if (type !== 'PDF') data.documentAssetId = null;
            if (media || type !== existing.type) {
                await transaction.lessonVideoQuality.deleteMany({ where: { lessonId: input.id } });
            }
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

    private async resourceAsset(tx: Prisma.TransactionClient, type: AdminCreateLessonResourceInput['type'], assetId: string | undefined, userId: string, courseId: string) {
        if (type === 'LINK') {
            if (assetId) throw new BadRequestException('Link resources require an external URL.');
            return null;
        }
        if (!assetId) throw new BadRequestException('Upload a verified file for this resource.');
        const asset = await privateAssetForAttachment(tx, assetId, userId, courseId, 'LESSON_RESOURCE');
        if (type === 'PDF' && asset.mimeType !== 'application/pdf') throw new BadRequestException('Choose a verified PDF file.');
        return asset;
    }

    async createResource(input: AdminCreateLessonResourceInput, actor: AuthenticatedUser, tx?: Prisma.TransactionClient) {
        return this.write(tx, async (transaction) => {
            const lesson = await transaction.courseLesson.findUnique({
                where: { id: input.lessonId },
                select: { id: true, section: { select: { courseId: true } } },
            });
            if (!lesson) throw new NotFoundException('Course lesson not found');
            await this.assertCourseEditable(lesson.section.courseId, transaction);
            const asset = await this.resourceAsset(transaction, input.type, input.mediaAssetId, actor.userId, lesson.section.courseId);
            if (!asset) validateSafeUrl(input.url);
            const count = await transaction.lessonResource.count({ where: { lessonId: input.lessonId } });
            return transaction.lessonResource.create({
                data: {
                    lessonId: input.lessonId,
                    title: input.title.trim(),
                    type: input.type,
                    url: asset ? '' : input.url.trim(),
                    mediaAssetId: asset?.id,
                    fileName: asset?.originalFileName ?? (input.fileName?.trim() || null),
                    fileSize: asset?.sizeBytes ?? input.fileSize ?? null,
                    position: count,
                },
            });
        });
    }

    async updateResource(input: AdminUpdateLessonResourceInput, actor: AuthenticatedUser, tx?: Prisma.TransactionClient) {
        return this.write(tx, async (transaction) => {
            const existing = await transaction.lessonResource.findUnique({
                where: { id: input.id },
                select: { id: true, type: true, url: true, mediaAssetId: true, lesson: { select: { section: { select: { courseId: true } } } } },
            });
            if (!existing) throw new NotFoundException('Lesson resource not found');
            await this.assertCourseEditable(existing.lesson.section.courseId, transaction);
            const type = input.type ?? existing.type;
            const asset = (input.mediaAssetId && input.mediaAssetId !== existing.mediaAssetId) || (type !== 'LINK' && type !== existing.type)
                ? await this.resourceAsset(transaction, type, input.mediaAssetId, actor.userId, existing.lesson.section.courseId) : null;
            if (type === 'LINK' && (type !== existing.type || (input.url && input.url.trim() !== existing.url))) validateSafeUrl(input.url ?? existing.url);
            else if (input.url && input.url.trim() !== existing.url) throw new BadRequestException('Replace resource files with a verified upload.');
            if (input.title === undefined && input.type === undefined && input.url === undefined &&
                input.fileName === undefined && input.fileSize === undefined && !asset) {
                throw new BadRequestException('At least one resource field must be provided');
            }
            return transaction.lessonResource.update({
                where: { id: input.id },
                data: {
                    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
                    ...(input.type !== undefined ? { type: input.type } : {}),
                    ...(type === 'LINK' ? { mediaAssetId: null, ...(input.url !== undefined ? { url: input.url.trim() } : {}) } : {}),
                    ...(input.fileName !== undefined ? { fileName: input.fileName?.trim() || null } : {}),
                    ...(input.fileSize !== undefined ? { fileSize: input.fileSize } : {}),
                    ...(asset ? { url: '', mediaAssetId: asset.id, fileName: asset.originalFileName, fileSize: asset.sizeBytes } : {}),
                },
            });
        });
    }

    async deleteResource(id: string, tx?: Prisma.TransactionClient) {
        return this.write(tx, async (transaction) => {
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

    async reorderResources(input: AdminReorderLessonResourcesInput, tx?: Prisma.TransactionClient) {
        return this.write(tx, async (transaction) => {
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

    async saveLesson(input: AdminSaveCourseLessonInput, actor: AuthenticatedUser) {
        return courseTransaction(this.prisma, async (tx) => {
            const { id, resources, sectionId, videoQualities, ...fields } = input;
            const current = id ? await tx.courseLesson.findUnique({
                where: { id },
                select: { sectionId: true, resources: { orderBy: { position: 'asc' } } },
            }) : null;
            if (id && current?.sectionId !== sectionId) throw new NotFoundException('Course lesson not found in this section.');
            const desiredIds = resources.flatMap((resource) => resource.id ? [resource.id] : []);
            const existingIds = current?.resources.map((resource) => resource.id) ?? [];
            if (new Set(desiredIds).size !== desiredIds.length || desiredIds.some((resourceId) => !existingIds.includes(resourceId))) {
                throw new BadRequestException('The submitted resources must belong to this lesson.');
            }

            const lesson = id ? await this.updateLesson({ id, ...fields }, actor, tx)
                : await this.createLesson({ sectionId, ...fields }, actor, tx);
            const qualities = videoQualities
                ? await this.saveVideoQualities(tx, lesson.id, lesson.videoAssetId, sectionId, actor.userId, videoQualities)
                : null;
            const removed = existingIds.filter((resourceId) => !desiredIds.includes(resourceId));
            const existingResources = new Map(current?.resources.map((resource) => [resource.id, resource]));
            const orderedResourceIds: string[] = [];
            for (const { id: resourceId, ...resource } of resources) {
                const previous = resourceId ? existingResources.get(resourceId) : undefined;
                if (previous && previous.title === resource.title.trim() && previous.type === resource.type &&
                    previous.url === resource.url.trim() && previous.mediaAssetId === (resource.mediaAssetId ?? null) &&
                    resource.fileName === undefined && resource.fileSize === undefined) {
                    orderedResourceIds.push(previous.id);
                    continue;
                }
                const saved = resourceId ? await this.updateResource({ id: resourceId, ...resource }, actor, tx)
                    : await this.createResource({ lessonId: lesson.id, ...resource }, actor, tx);
                orderedResourceIds.push(saved.id);
            }
            if (removed.length) await tx.lessonResource.deleteMany({ where: { lessonId: lesson.id, id: { in: removed } } });
            if (orderedResourceIds.some((resourceId, index) => resourceId !== existingIds[index])) {
                await this.reorderResources({ lessonId: lesson.id, orderedResourceIds }, tx);
            }
            return {
                ...lesson,
                videoQualities: qualities,
                resources: await tx.lessonResource.findMany({ where: { lessonId: lesson.id }, orderBy: { position: 'asc' } }),
            };
        }, input.resources.length > 100 ? 30000 : 15000);
    }

    private async saveVideoQualities(
        tx: Prisma.TransactionClient,
        lessonId: string,
        originalId: string | null,
        sectionId: string,
        userId: string,
        qualities: LessonVideoQualityInput[],
    ) {
        if (qualities.length && !originalId) throw new BadRequestException('Upload the original lesson video before adding quality options.');
        const assetIds = new Set(qualities.map(({ assetId }) => assetId));
        if (assetIds.size !== qualities.length || (originalId && assetIds.has(originalId)) ||
            new Set(qualities.map(({ height }) => height)).size !== qualities.length) {
            throw new BadRequestException('Use a separate upload for each video quality.');
        }
        const current = await tx.lessonVideoQuality.findMany({ where: { lessonId } });
        const changes = qualities.filter(({ height, assetId }) => !current.some((item) => item.height === height && item.assetId === assetId));
        if (changes.length) {
            const { courseId } = await tx.courseSection.findUniqueOrThrow({ where: { id: sectionId }, select: { courseId: true } });
            for (const { assetId } of changes) await privateAssetForAttachment(tx, assetId, userId, courseId, 'LESSON_VIDEO');
        }
        const removed = current.filter(({ height, assetId }) => !qualities.some((item) => item.height === height && item.assetId === assetId));
        if (removed.length) await tx.lessonVideoQuality.deleteMany({ where: { lessonId, height: { in: removed.map(({ height }) => height) } } });
        if (changes.length) {
            await tx.lessonVideoQuality.createMany({ data: changes.map(({ height, assetId }) => ({ lessonId, height, assetId })) });
        }
        return qualities;
    }
}
