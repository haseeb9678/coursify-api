import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ParseUUIDPipe, UseGuards } from '@nestjs/common';

import { GqlAuthGuard } from '../../common/guards/gql-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { PaginationInput } from '../../common/pagination/pagination.input.js';
import { MutationResponse, createMutationResponse } from '../../common/responses/mutation.response.js';
import { CourseStatus, UserRole } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { CoursesService } from './courses.service.js';
import {
    AdminCoursesFilterInput,
    AdminCourseSortInput,
    AdminCreateCourseInput,
    AdminUpdateCourseInput,
    AdminUpdateCourseFeaturedInput,
} from './dto/course.inputs.js';
import {
    AdminCourse,
    AdminCourseMutationResponse,
    AdminCoursesResponse,
    AdminCourseStats,
    CourseCategoryOption,
    CourseInstructorOption,
} from './entities/course.entities.js';

@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminCoursesResolver {
    constructor(private readonly service: CoursesService) {}

    @Query(() => AdminCoursesResponse, { name: 'adminCourses' })
    adminCourses(
        @Args('pagination', { type: () => PaginationInput, defaultValue: { page: 1, limit: 10 } }) pagination: PaginationInput,
        @Args('filter', { type: () => AdminCoursesFilterInput, nullable: true }) filter?: AdminCoursesFilterInput,
        @Args('sort', { type: () => AdminCourseSortInput, nullable: true }) sort?: AdminCourseSortInput,
    ) {
        return this.service.findCourses(pagination, filter, sort);
    }

    @Query(() => AdminCourse, { name: 'adminCourse' })
    adminCourse(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.service.findCourse(id);
    }

    @Query(() => AdminCourseStats, { name: 'adminCourseStats' })
    adminCourseStats() {
        return this.service.getStats();
    }

    @Query(() => [CourseInstructorOption], { name: 'adminCourseInstructorOptions' })
    adminCourseInstructorOptions(
        @Args('search', { type: () => String, nullable: true }) search?: string,
    ) {
        return this.service.getInstructorOptions(search);
    }

    @Query(() => [CourseCategoryOption], { name: 'adminCourseCategoryOptions' })
    adminCourseCategoryOptions(
        @Args('search', { type: () => String, nullable: true }) search?: string,
    ) {
        return this.service.getCategoryOptions(search);
    }

    @Mutation(() => AdminCourseMutationResponse, { name: 'adminCreateCourse' })
    async adminCreateCourse(
        @Args('input') input: AdminCreateCourseInput,
        @CurrentUser() actor: AuthenticatedUser,
    ) {
        const course = await this.service.createCourse(input, actor);
        return { ...createMutationResponse('Course created successfully'), course };
    }

    @Mutation(() => AdminCourseMutationResponse, { name: 'adminUpdateCourse' })
    async adminUpdateCourse(@Args('input') input: AdminUpdateCourseInput) {
        const course = await this.service.updateCourse(input);
        return { ...createMutationResponse('Course updated successfully'), course };
    }

    @Mutation(() => MutationResponse, { name: 'adminDeleteCourse' })
    adminDeleteCourse(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.service.deleteCourse(id);
    }

    @Mutation(() => AdminCourseMutationResponse, { name: 'adminSubmitCourseForReview' })
    async adminSubmitCourseForReview(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        const course = await this.service.submitCourse(id);
        return { ...createMutationResponse('Course submitted for review'), course };
    }

    @Mutation(() => AdminCourseMutationResponse, { name: 'adminWithdrawCourseSubmission' })
    async adminWithdrawCourseSubmission(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        const course = await this.service.withdrawSubmission(id);
        return { ...createMutationResponse('Course submission withdrawn'), course };
    }

    @Mutation(() => AdminCourseMutationResponse, { name: 'adminPublishCourse' })
    async adminPublishCourse(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        const course = await this.service.publishCourse(id);
        return { ...createMutationResponse('Course published successfully'), course };
    }

    @Mutation(() => AdminCourseMutationResponse, { name: 'adminArchiveCourse' })
    async adminArchiveCourse(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        const course = await this.service.archiveCourse(id);
        return { ...createMutationResponse('Course archived successfully'), course };
    }

    @Mutation(() => AdminCourseMutationResponse, { name: 'adminRestoreCourse' })
    async adminRestoreCourse(
        @Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
        @Args('expectedStatus', { type: () => CourseStatus, nullable: true }) expectedStatus?: CourseStatus,
    ) {
        const course = await this.service.restoreCourse(id, expectedStatus ?? undefined);
        return { ...createMutationResponse('Course restored to draft'), course };
    }

    @Mutation(() => AdminCourseMutationResponse, { name: 'adminUpdateCourseFeaturedStatus' })
    async adminUpdateCourseFeaturedStatus(@Args('input') input: AdminUpdateCourseFeaturedInput) {
        const course = await this.service.updateFeatured(input);
        return { ...createMutationResponse('Course featured status updated'), course };
    }
}
