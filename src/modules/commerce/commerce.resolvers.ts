import { ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { GqlAuthGuard } from '../../common/guards/gql-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { PaginationInput } from '../../common/pagination/pagination.input.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';

import { CheckoutService } from './checkout.service.js';
import { CommerceOriginGuard } from './commerce-origin.guard.js';
import { CommerceReadService } from './commerce-read.service.js';
import {
    AdminCommercePayment, AdminCommercePaymentPage, CheckoutReconcileInput, CheckoutStartInput,
    CommerceCheckoutQuote, CommerceCheckoutSession, CommerceCheckoutStatus, CommerceCourseStatus,
    CommerceEnrollment, CommerceEnrollmentFilter, CommerceEnrollmentPage, CommerceEnrollmentStats,
    CommerceLearningContent, CommerceOrder, CommerceOrderFilter, CommerceOrderPage, CommerceOrderStats,
    CommercePayment, CommercePaymentFilter, CommercePaymentPage, CommercePaymentStats,
    CommerceWebhookFilter, CommerceWebhookPage, LessonComment, LessonCommentPage, StudentCommerceStats,
} from './commerce.models.js';
import { EnrollmentService } from './enrollment.service.js';

@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
@Roles('STUDENT')
export class StudentCommerceResolver {
    constructor(
        private readonly enrollment: EnrollmentService,
        private readonly checkout: CheckoutService,
        private readonly read: CommerceReadService,
    ) {}

    @Query(() => CommerceEnrollmentPage)
    myEnrollments(
        @CurrentUser() user: AuthenticatedUser,
        @Args('pagination') pagination: PaginationInput,
        @Args('filter', { type: () => CommerceEnrollmentFilter, nullable: true }) filter?: CommerceEnrollmentFilter,
    ) {
        return this.read.enrollments(pagination, filter, user.userId);
    }

    @Query(() => CommerceEnrollment)
    myEnrollment(
        @CurrentUser() user: AuthenticatedUser,
        @Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
    ) {
        return this.read.enrollment(id, user.userId);
    }

    @Query(() => CommerceOrderPage)
    myOrders(
        @CurrentUser() user: AuthenticatedUser,
        @Args('pagination') pagination: PaginationInput,
        @Args('filter', { type: () => CommerceOrderFilter, nullable: true }) filter?: CommerceOrderFilter,
    ) {
        return this.read.orders(pagination, filter, user.userId);
    }

    @Query(() => CommerceOrder)
    myOrder(
        @CurrentUser() user: AuthenticatedUser,
        @Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
    ) {
        return this.read.order(id, user.userId);
    }

    @Query(() => CommercePaymentPage)
    myPayments(
        @CurrentUser() user: AuthenticatedUser,
        @Args('pagination') pagination: PaginationInput,
        @Args('filter', { type: () => CommercePaymentFilter, nullable: true }) filter?: CommercePaymentFilter,
    ) {
        return this.read.payments(pagination, filter, user.userId);
    }

    @Query(() => CommercePayment)
    myPayment(
        @CurrentUser() user: AuthenticatedUser,
        @Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
    ) {
        return this.read.payment(id, user.userId);
    }

    @Query(() => StudentCommerceStats)
    myCommerceStats(@CurrentUser() user: AuthenticatedUser) {
        return this.read.studentStats(user.userId);
    }

    @Query(() => CommerceCourseStatus)
    courseEnrollmentStatus(
        @CurrentUser() user: AuthenticatedUser,
        @Args('courseId', { type: () => ID }, ParseUUIDPipe) courseId: string,
    ) {
        return this.checkout.courseStatus(user.userId, courseId);
    }

    @Query(() => CommerceCheckoutQuote)
    checkoutQuote(
        @CurrentUser() user: AuthenticatedUser,
        @Args('courseId', { type: () => ID }, ParseUUIDPipe) courseId: string,
    ) {
        return this.checkout.quote(user.userId, courseId);
    }

    @Query(() => CommerceCheckoutStatus)
    checkoutStatus(
        @CurrentUser() user: AuthenticatedUser,
        @Args('orderId', { type: () => ID }, ParseUUIDPipe) orderId: string,
    ) {
        return this.checkout.status(user.userId, orderId);
    }

    @Query(() => CommerceLearningContent)
    myCourseLearningContent(
        @CurrentUser() user: AuthenticatedUser,
        @Args('courseId', { type: () => ID }, ParseUUIDPipe) courseId: string,
    ) {
        return this.enrollment.learningContent(user.userId, courseId);
    }

    @Query(() => LessonCommentPage)
    lessonComments(
        @CurrentUser() user: AuthenticatedUser,
        @Args('courseId', { type: () => ID }, ParseUUIDPipe) courseId: string,
        @Args('lessonId', { type: () => ID }, ParseUUIDPipe) lessonId: string,
        @Args('pagination') pagination: PaginationInput,
    ) {
        return this.enrollment.lessonComments(user.userId, courseId, lessonId, pagination);
    }

    @Mutation(() => LessonComment)
    @UseGuards(CommerceOriginGuard)
    postLessonComment(
        @CurrentUser() user: AuthenticatedUser,
        @Args('courseId', { type: () => ID }, ParseUUIDPipe) courseId: string,
        @Args('lessonId', { type: () => ID }, ParseUUIDPipe) lessonId: string,
        @Args('body', { type: () => String }) body: string,
    ) {
        return this.enrollment.postLessonComment(user.userId, courseId, lessonId, body);
    }

    @Mutation(() => CommerceEnrollment)
    @UseGuards(CommerceOriginGuard)
    enrollInFreeCourse(
        @CurrentUser() user: AuthenticatedUser,
        @Args('courseId', { type: () => ID }, ParseUUIDPipe) courseId: string,
    ) {
        return this.enrollment.enrollFree(user.userId, courseId);
    }

    @Mutation(() => CommerceCheckoutSession)
    @UseGuards(CommerceOriginGuard)
    createCheckoutSession(@CurrentUser() user: AuthenticatedUser, @Args('input') input: CheckoutStartInput) {
        return this.checkout.start(user.userId, input.courseId, input);
    }

    @Mutation(() => CommerceCheckoutStatus)
    @UseGuards(CommerceOriginGuard)
    reconcileCheckout(@CurrentUser() user: AuthenticatedUser, @Args('input') input: CheckoutReconcileInput) {
        return this.checkout.reconcile(user.userId, input.orderId, input.sessionId);
    }
}

@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminCommerceResolver {
    constructor(private readonly read: CommerceReadService) {}

    @Query(() => CommerceEnrollmentPage)
    adminEnrollments(
        @Args('pagination') pagination: PaginationInput,
        @Args('filter', { type: () => CommerceEnrollmentFilter, nullable: true }) filter?: CommerceEnrollmentFilter,
    ) {
        return this.read.enrollments(pagination, filter);
    }

    @Query(() => CommerceEnrollment)
    adminEnrollment(
        @Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
    ) {
        return this.read.enrollment(id);
    }

    @Query(() => CommerceEnrollmentStats)
    adminEnrollmentStats() {
        return this.read.enrollmentStats();
    }

    @Query(() => CommerceOrderPage)
    adminOrders(
        @Args('pagination') pagination: PaginationInput,
        @Args('filter', { type: () => CommerceOrderFilter, nullable: true }) filter?: CommerceOrderFilter,
    ) {
        return this.read.orders(pagination, filter);
    }

    @Query(() => CommerceOrder)
    adminOrder(
        @Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
    ) {
        return this.read.order(id);
    }

    @Query(() => [CommerceOrderStats])
    adminOrderStats() {
        return this.read.orderStats();
    }

    @Query(() => AdminCommercePaymentPage)
    adminPayments(
        @Args('pagination') pagination: PaginationInput,
        @Args('filter', { type: () => CommercePaymentFilter, nullable: true }) filter?: CommercePaymentFilter,
    ) {
        return this.read.payments(pagination, filter);
    }

    @Query(() => AdminCommercePayment)
    adminPayment(
        @Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
    ) {
        return this.read.payment(id);
    }

    @Query(() => CommercePaymentStats)
    adminPaymentStats() {
        return this.read.paymentStats();
    }

    @Query(() => CommerceWebhookPage)
    adminCommerceWebhooks(
        @Args('pagination') pagination: PaginationInput,
        @Args('filter', { type: () => CommerceWebhookFilter, nullable: true }) filter?: CommerceWebhookFilter,
    ) {
        return this.read.webhooks(pagination, filter);
    }
}
