import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Pagination {
    @Field(() => Int)
    page!: number;

    @Field(() => Int)
    limit!: number;

    @Field(() => Int)
    total!: number;

    @Field(() => Int)
    totalPages!: number;

    @Field(() => Boolean)
    hasNextPage!: boolean;

    @Field(() => Boolean)
    hasPreviousPage!: boolean;
}

export function createPagination(
    page: number,
    limit: number,
    total: number,
): Pagination {
    const totalPages = Math.ceil(total / limit);

    return {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
    };
}