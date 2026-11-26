import { type Type } from '@nestjs/common';
import { Field, ObjectType } from '@nestjs/graphql';

import {
    Pagination,
    createPagination,
} from './pagination.response.js';

export function PaginatedResponse<T>(classRef: Type<T>) {
    @ObjectType({ isAbstract: true })
    abstract class PaginatedType {
        @Field(() => [classRef])
        items!: T[];

        @Field(() => Pagination)
        pagination!: Pagination;
    }

    return PaginatedType;
}

export function createPaginatedResponse<T>(
    items: T[],
    page: number,
    limit: number,
    total: number,
) {
    return {
        items,
        pagination: createPagination(page, limit, total),
    };
}