import { Args, Query, Resolver } from '@nestjs/graphql';

import { PaginationInput } from '../../common/pagination/pagination.input.js';
import { CategoriesService } from './categories.service.js';
import { PublicCategoriesResponse, PublicCategory } from './entities/category.entities.js';

@Resolver()
export class PublicCategoriesResolver {
    constructor(private readonly service: CategoriesService) {}

    @Query(() => PublicCategoriesResponse, { name: 'categories' })
    categories(
        @Args('pagination', { type: () => PaginationInput, defaultValue: { page: 1, limit: 10 } })
        pagination: PaginationInput,
        @Args('search', { type: () => String, nullable: true }) search?: string,
    ) {
        return this.service.findPublicCategories(pagination, search);
    }

    @Query(() => PublicCategory, { name: 'category' })
    category(@Args('slug', { type: () => String }) slug: string) {
        return this.service.findPublicCategory(slug);
    }
}
