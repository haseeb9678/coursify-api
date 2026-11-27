import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ParseUUIDPipe, UseGuards } from '@nestjs/common';

import { GqlAuthGuard } from '../../common/guards/gql-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { PaginationInput } from '../../common/pagination/pagination.input.js';
import { createMutationResponse } from '../../common/responses/mutation.response.js';
import { UserRole } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { CourseReviewsService } from './course-reviews.service.js';
import {
    AdminApproveCourseInput,
    AdminCourseApprovalsFilterInput,
    AdminRejectCourseInput,
} from './dto/course-review.inputs.js';
import {
    AdminCourseApprovalDetails,
    AdminCourseApprovalStats,
    AdminCourseApprovalsResponse,
    AdminCourseReviewHistoryResponse,
    CourseApprovalMutationResponse,
} from './entities/course-review.entities.js';

@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminCourseReviewsResolver {
    constructor(private readonly service: CourseReviewsService) {}

    @Query(() => AdminCourseApprovalsResponse, { name: 'adminCourseApprovals' })
    adminCourseApprovals(
        @Args('pagination', { type: () => PaginationInput, defaultValue: { page: 1, limit: 10 } }) pagination: PaginationInput,
        @Args('filter', { type: () => AdminCourseApprovalsFilterInput, nullable: true }) filter?: AdminCourseApprovalsFilterInput,
    ) {
        return this.service.findApprovals(pagination, filter);
    }

    @Query(() => AdminCourseApprovalStats, { name: 'adminCourseApprovalStats' })
    adminCourseApprovalStats() {
        return this.service.getStats();
    }

    @Query(() => AdminCourseApprovalDetails, { name: 'adminCourseApprovalDetails' })
    adminCourseApprovalDetails(@Args('courseId', { type: () => ID }, ParseUUIDPipe) courseId: string) {
        return this.service.getDetails(courseId);
    }

    @Mutation(() => CourseApprovalMutationResponse, { name: 'adminApproveCourse' })
    async adminApproveCourse(
        @Args('input') input: AdminApproveCourseInput,
        @CurrentUser() actor: AuthenticatedUser,
    ) {
        const result = await this.service.approve(input, actor);
        return { ...createMutationResponse('Course approved successfully'), ...result };
    }

    @Mutation(() => CourseApprovalMutationResponse, { name: 'adminRejectCourse' })
    async adminRejectCourse(
        @Args('input') input: AdminRejectCourseInput,
        @CurrentUser() actor: AuthenticatedUser,
    ) {
        const result = await this.service.reject(input, actor);
        return { ...createMutationResponse('Course rejected successfully'), ...result };
    }

    @Query(() => AdminCourseReviewHistoryResponse, { name: 'adminCourseReviewHistory' })
    adminCourseReviewHistory(
        @Args('courseId', { type: () => ID }, ParseUUIDPipe) courseId: string,
        @Args('pagination', { type: () => PaginationInput, defaultValue: { page: 1, limit: 10 } }) pagination: PaginationInput,
    ) {
        return this.service.getHistory(courseId, pagination);
    }
}
