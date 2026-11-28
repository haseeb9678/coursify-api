import { ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { GqlAuthGuard } from '../../common/guards/gql-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { PaginationInput } from '../../common/pagination/pagination.input.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { StorageAccessService } from '../storage/storage-access.service.js';
import { AdminMediaFilter, AdminMediaPage, MediaReadAccess } from '../storage/storage.models.js';
import { StorageService } from '../storage/storage.service.js';
import { StorageOriginGuard } from '../storage/storage.resolver.js';
import {
    InstructorAnalytics, InstructorEnrollmentPage, InstructorReportFilter, InstructorReviewPage, InstructorSalesPage,
} from './instructor.models.js';
import { InstructorReportsService } from './instructor-reports.service.js';

@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
@Roles('INSTRUCTOR')
export class InstructorReportsResolver {
    constructor(
        private readonly reports: InstructorReportsService,
        private readonly storage: StorageService,
        private readonly access: StorageAccessService,
    ) {}

    @Query(() => InstructorAnalytics)
    instructorAnalytics(
        @CurrentUser() actor: AuthenticatedUser,
        @Args('days', { type: () => Int, defaultValue: 30 }) days: number,
        @Args('courseId', { type: () => ID, nullable: true }, new ParseUUIDPipe({ optional: true })) courseId?: string,
    ) {
        return this.reports.analytics(actor.userId, days, courseId);
    }

    @Query(() => InstructorEnrollmentPage)
    instructorEnrollments(
        @CurrentUser() actor: AuthenticatedUser, @Args('pagination') pagination: PaginationInput,
        @Args('filter', { type: () => InstructorReportFilter, nullable: true }) filter?: InstructorReportFilter,
    ) {
        return this.reports.enrollments(actor.userId, pagination, filter ?? {});
    }

    @Query(() => InstructorEnrollmentPage)
    instructorStudent(
        @CurrentUser() actor: AuthenticatedUser, @Args('pagination') pagination: PaginationInput,
        @Args('studentId', { type: () => ID }, ParseUUIDPipe) studentId: string,
    ) {
        return this.reports.enrollments(actor.userId, pagination, { studentId }, true);
    }

    @Query(() => InstructorReviewPage)
    instructorReviews(
        @CurrentUser() actor: AuthenticatedUser, @Args('pagination') pagination: PaginationInput,
        @Args('filter', { type: () => InstructorReportFilter, nullable: true }) filter?: InstructorReportFilter,
    ) {
        return this.reports.reviews(actor.userId, pagination, filter ?? {});
    }

    @Query(() => InstructorSalesPage)
    instructorSales(
        @CurrentUser() actor: AuthenticatedUser, @Args('pagination') pagination: PaginationInput,
        @Args('days', { type: () => Int, defaultValue: 30 }) days: number,
        @Args('courseId', { type: () => ID, nullable: true }, new ParseUUIDPipe({ optional: true })) courseId?: string,
    ) {
        return this.reports.sales(actor.userId, pagination, days, courseId);
    }

    @Query(() => AdminMediaPage)
    instructorMedia(
        @CurrentUser() actor: AuthenticatedUser, @Args('pagination') pagination: PaginationInput,
        @Args('filter', { type: () => AdminMediaFilter, nullable: true }) filter?: AdminMediaFilter,
        @Args('oldestFirst', { type: () => Boolean, defaultValue: false }) oldestFirst = false,
    ) {
        return this.storage.list(pagination, filter ?? undefined, oldestFirst, actor.userId);
    }

    @Query(() => MediaReadAccess)
    instructorMediaRead(@CurrentUser() actor: AuthenticatedUser, @Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.access.instructorRead(actor.userId, id);
    }

    @Mutation(() => Boolean)
    @UseGuards(StorageOriginGuard)
    instructorDeleteMedia(@CurrentUser() actor: AuthenticatedUser, @Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.storage.deleteUnused(id, undefined, actor.userId);
    }
}
