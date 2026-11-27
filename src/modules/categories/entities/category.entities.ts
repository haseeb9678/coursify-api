import {
    Field,
    ID,
    Int,
    ObjectType,
    GraphQLISODateTime,
    registerEnumType,
} from '@nestjs/graphql';

import { CategoryStatus } from '../../../generated/prisma/enums.js';
import { PaginationMeta } from '../../../common/pagination/pagination-meta.entity.js';
import { MutationResponse } from '../../../common/responses/mutation.response.js';

registerEnumType(CategoryStatus, { name: 'CategoryStatus' });

@ObjectType()
export class AdminCategory {
    @Field(() => ID) id!: string;
    @Field(() => String) name!: string;
    @Field(() => String) slug!: string;
    @Field(() => String) description!: string;
    @Field(() => String) iconName!: string;
    @Field(() => String) iconColor!: string;
    @Field(() => String) iconBackground!: string;
    @Field(() => String, { nullable: true }) imageUrl!: string | null;
    @Field(() => CategoryStatus) status!: CategoryStatus;
    @Field(() => Int) courseCount!: number;
    @Field(() => GraphQLISODateTime) createdAt!: Date;
    @Field(() => GraphQLISODateTime) updatedAt!: Date;
}

@ObjectType()
export class PublicCategory {
    @Field(() => ID) id!: string;
    @Field(() => String) name!: string;
    @Field(() => String) slug!: string;
    @Field(() => String) description!: string;
    @Field(() => String) iconName!: string;
    @Field(() => String) iconBackground!: string;
    @Field(() => String) iconColor!: string;
    @Field(() => String, { nullable: true }) imageUrl!: string | null;
    @Field(() => Int) courseCount!: number;
}

@ObjectType()
export class AdminCategoriesResponse {
    @Field(() => [AdminCategory]) items!: AdminCategory[];
    @Field(() => PaginationMeta) meta!: PaginationMeta;
}

@ObjectType()
export class PublicCategoriesResponse {
    @Field(() => [PublicCategory]) items!: PublicCategory[];
    @Field(() => PaginationMeta) meta!: PaginationMeta;
}

@ObjectType()
export class AdminCategoryStats {
    @Field(() => Int) totalCategories!: number;
    @Field(() => Int) activeCategories!: number;
    @Field(() => Int) inactiveCategories!: number;
    @Field(() => Int) categorizedCourses!: number;
}

@ObjectType()
export class AdminCategoryMutationResponse extends MutationResponse {
    @Field(() => AdminCategory)
    category!: AdminCategory;
}
