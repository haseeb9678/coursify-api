import { BadRequestException } from '@nestjs/common';

import type { PaginationMeta } from './pagination-meta.entity.js';

export interface PaginationOptions {
    page?: number;
    limit?: number;
}

export interface PaginationWindow {
    page: number;
    limit: number;
    skip: number;
    take: number;
}

export function getPaginationWindow(
    options: PaginationOptions = {},
): PaginationWindow {
    const page = options.page ?? 1;
    const limit = options.limit ?? 10;

    if (!Number.isSafeInteger(page) || page < 1) {
        throw new BadRequestException(
            'Page must be a positive safe integer',
        );
    }

    if (
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100
    ) {
        throw new BadRequestException(
            'Limit must be an integer between 1 and 100',
        );
    }

    const skip = (page - 1) * limit;

    if (!Number.isSafeInteger(skip)) {
        throw new BadRequestException(
            'Pagination offset exceeds the supported range',
        );
    }

    return { page, limit, skip, take: limit };
}

export function createPaginationMeta(
    page: number,
    limit: number,
    total: number,
): PaginationMeta {
    if (!Number.isSafeInteger(total) || total < 0) {
        throw new BadRequestException(
            'Total record count must be a non-negative safe integer',
        );
    }

    const totalPages = Math.ceil(total / limit);

    return {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
    };
}
