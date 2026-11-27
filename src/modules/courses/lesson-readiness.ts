import type { Prisma } from '../../generated/prisma/client.js';
import { LessonType } from '../../generated/prisma/enums.js';

export const lessonReadinessSelect = {
    title: true,
    type: true,
    content: true,
    videoUrl: true,
    videoAssetId: true,
    documentUrl: true,
    documentAssetId: true,
    durationSeconds: true,
} satisfies Prisma.CourseLessonSelect;

export type LessonReadiness = Prisma.CourseLessonGetPayload<{ select: typeof lessonReadinessSelect }>;

export function lessonReadinessErrors(lesson: LessonReadiness): string[] {
    switch (lesson.type) {
        case LessonType.VIDEO: {
            const errors: string[] = [];
            if (!lesson.videoAssetId && !lesson.videoUrl?.trim()) {
                errors.push(`Video lesson "${lesson.title}" requires a video`);
            }
            if ((lesson.durationSeconds ?? 0) <= 0) {
                errors.push(`Video lesson "${lesson.title}" requires a positive duration`);
            }
            return errors;
        }
        case LessonType.PDF:
            return lesson.documentAssetId || lesson.documentUrl?.trim()
                ? [] : [`PDF lesson "${lesson.title}" requires a document`];
        case LessonType.TEXT:
            return lesson.content.trim().length >= 20 ? [] : [`Text lesson "${lesson.title}" requires text content`];
    }
}
