import { ConflictException } from '@nestjs/common';

import type { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { CourseStatus } from '../../generated/prisma/enums.js';

const transitions: Record<CourseStatus, readonly CourseStatus[]> = {
    DRAFT: ['PENDING_REVIEW'],
    PENDING_REVIEW: ['APPROVED', 'REJECTED', 'DRAFT'],
    APPROVED: ['PUBLISHED', 'DRAFT'],
    REJECTED: ['DRAFT', 'PENDING_REVIEW'],
    PUBLISHED: ['ARCHIVED', 'DRAFT'],
    ARCHIVED: ['DRAFT'],
};

export function canEditCourse(status: CourseStatus): boolean {
    return status === 'DRAFT' || status === 'REJECTED';
}

export function canDeleteCourse(status: CourseStatus, reviewCount: number): boolean {
    return status === 'DRAFT' && reviewCount === 0;
}

export function assertCourseTransition(status: CourseStatus, destination: CourseStatus, message: string): void {
    if (!transitions[status].includes(destination)) throw new ConflictException(message);
}

export function assertCourseStatus(status: CourseStatus, expectedStatus: CourseStatus | undefined): void {
    if (expectedStatus !== undefined && status !== expectedStatus) {
        throw new ConflictException('The course status changed. Refresh it and try again.');
    }
}

export async function courseTransaction<T>(
    prisma: PrismaService,
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
    try {
        return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
            throw new ConflictException('The course changed during this operation. Refresh it and try again.');
        }
        throw error;
    }
}
