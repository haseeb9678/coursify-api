import { BadRequestException } from '@nestjs/common';

import {
    createPaginationMeta,
    getPaginationWindow,
} from './pagination.utils.js';

describe('pagination utilities', () => {
    it('calculates a bounded offset and response metadata', () => {
        expect(getPaginationWindow({ page: 3, limit: 20 })).toEqual({
            page: 3,
            limit: 20,
            skip: 40,
            take: 20,
        });
        expect(createPaginationMeta(3, 20, 45)).toEqual({
            page: 3,
            limit: 20,
            total: 45,
            totalPages: 3,
            hasNext: false,
            hasPrevious: true,
        });
    });

    it('rejects a limit above the maximum page size', () => {
        expect(() => getPaginationWindow({ page: 1, limit: 101 }))
            .toThrow(BadRequestException);
    });
});
