import { Args, Int, Query, Resolver, ID } from '@nestjs/graphql';

import { PaginationInput } from '../../common/pagination/pagination.input.js';
import { CoursesService } from './courses.service.js';
import { AdminCoursesFilterInput } from './dto/course.inputs.js';
import { PublicCourse, PublicCoursesResponse } from './entities/course.entities.js';

@Resolver()
export class PublicCoursesResolver {
    constructor(private readonly service: CoursesService) {}

    @Query(() => PublicCoursesResponse, { name: 'courses' })
    courses(
        @Args('pagination', { type: () => PaginationInput, defaultValue: { page: 1, limit: 10 } }) pagination: PaginationInput,
        @Args('filter', { type: () => AdminCoursesFilterInput, nullable: true }) filter?: AdminCoursesFilterInput,
    ) {
        return this.service.findPublicCourses(pagination, filter);
    }

    @Query(() => PublicCourse, { name: 'course' })
    course(@Args('identifier', { type: () => String }) identifier: string) {
        return this.service.findPublicCourse(identifier);
    }

    @Query(() => [PublicCourse], { name: 'featuredCourses' })
    featuredCourses(@Args('limit', { type: () => Int, defaultValue: 6 }) limit: number) {
        return this.service.findFeaturedCourses(limit);
    }

    @Query(() => [PublicCourse], { name: 'relatedCourses' })
    relatedCourses(
        @Args('courseId', { type: () => ID }) courseId: string,
        @Args('limit', { type: () => Int, defaultValue: 6 }) limit: number,
    ) {
        return this.service.findRelatedCourses(courseId, limit);
    }
}
