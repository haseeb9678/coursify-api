import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ParseUUIDPipe, UseGuards } from '@nestjs/common';

import { GqlAuthGuard } from '../../common/guards/gql-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { UserRole } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { PaginationInput } from '../../common/pagination/pagination.input.js';
import { MutationResponse, createMutationResponse } from '../../common/responses/mutation.response.js';
import { CategoriesService } from './categories.service.js';
import {
    AdminCategoriesFilterInput,
    AdminCategorySortInput,
    AdminCreateCategoryInput,
    AdminUpdateCategoryInput,
    AdminUpdateCategoryStatusInput,
} from './dto/category.inputs.js';
import {
    AdminCategoriesResponse,
    AdminCategory,
    AdminCategoryMutationResponse,
    AdminCategoryStats,
} from './entities/category.entities.js';

@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminCategoriesResolver {
    constructor(private readonly service: CategoriesService) {}

    @Query(() => AdminCategoriesResponse, { name: 'adminCategories' })
    adminCategories(
        @Args('pagination', { type: () => PaginationInput, defaultValue: { page: 1, limit: 10 } })
        pagination: PaginationInput,
        @Args('filter', { type: () => AdminCategoriesFilterInput, nullable: true }) filter?: AdminCategoriesFilterInput,
        @Args('sort', { type: () => AdminCategorySortInput, nullable: true }) sort?: AdminCategorySortInput,
    ) {
        return this.service.findAdminCategories(pagination, filter, sort);
    }

    @Query(() => AdminCategory, { name: 'adminCategory' })
    adminCategory(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.service.findAdminCategory(id);
    }

    @Query(() => AdminCategoryStats, { name: 'adminCategoryStats' })
    adminCategoryStats() {
        return this.service.getAdminStats();
    }

    @Mutation(() => AdminCategoryMutationResponse, { name: 'adminCreateCategory' })
    async adminCreateCategory(
        @Args('input') input: AdminCreateCategoryInput,
        @CurrentUser() actor: AuthenticatedUser,
    ) {
        const category = await this.service.createCategory(input, actor);
        return { ...createMutationResponse('Category created successfully'), category };
    }

    @Mutation(() => AdminCategoryMutationResponse, { name: 'adminUpdateCategory' })
    async adminUpdateCategory(@Args('input') input: AdminUpdateCategoryInput) {
        const category = await this.service.updateCategory(input);
        return { ...createMutationResponse('Category updated successfully'), category };
    }

    @Mutation(() => AdminCategoryMutationResponse, { name: 'adminUpdateCategoryStatus' })
    async adminUpdateCategoryStatus(@Args('input') input: AdminUpdateCategoryStatusInput) {
        const category = await this.service.updateCategoryStatus(input);
        return { ...createMutationResponse('Category status updated successfully'), category };
    }

    @Mutation(() => MutationResponse, { name: 'adminDeleteCategory' })
    adminDeleteCategory(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.service.deleteCategory(id);
    }
}
