import { Field, ID, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { IsBoolean, IsDate, IsEnum, IsInt, IsOptional, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

import { PaginationMeta } from '../../common/pagination/pagination-meta.entity.js';
import { EnrollmentSource, EnrollmentStatus, OrderStatus, PaymentProvider, PaymentStatus, RefundStatus, WebhookStatus } from '../../generated/prisma/enums.js';

registerEnumType(EnrollmentSource, { name: 'EnrollmentSource' });
registerEnumType(EnrollmentStatus, { name: 'EnrollmentStatus' });
registerEnumType(OrderStatus, { name: 'OrderStatus' });
registerEnumType(PaymentProvider, { name: 'PaymentProvider' });
registerEnumType(PaymentStatus, { name: 'PaymentStatus' });
registerEnumType(RefundStatus, { name: 'RefundStatus' });
registerEnumType(WebhookStatus, { name: 'WebhookStatus' });

// Classes referenced by a field decorator are declared before their consumers.
@ObjectType()
export class CommercePerson {
    @Field(() => String) name!: string;
    @Field(() => String, { nullable: true }) email?: string | null;
}

@ObjectType()
export class CommerceCourse {
    @Field(() => ID) id!: string;
    @Field(() => String) title!: string;
    @Field(() => String) slug!: string;
    @Field(() => String, { nullable: true }) thumbnailUrl?: string | null;
    @Field(() => CommercePerson) instructor!: CommercePerson;
    @Field(() => CommercePerson) category!: CommercePerson;
    @Field(() => String) status!: string;
    @Field(() => ID, { nullable: true }) categoryId?: string;
    @Field(() => String, { nullable: true }) level?: string;
    @Field(() => Int, { nullable: true }) sectionCount?: number;
    @Field(() => Int, { nullable: true }) lessonCount?: number;
    @Field(() => Int, { nullable: true }) durationSeconds?: number | null;
}

@ObjectType()
export class CommerceOrderReference {
    @Field(() => ID) id!: string;
    @Field(() => String) orderNumber!: string;
}

@ObjectType()
export class CommerceEnrollmentReference {
    @Field(() => ID) id!: string;
    @Field(() => EnrollmentStatus) status!: EnrollmentStatus;
    @Field(() => EnrollmentSource) source!: EnrollmentSource;
}

@ObjectType()
export class CommerceCourseLink {
    @Field(() => String) slug!: string;
    @Field(() => String, { nullable: true }) thumbnailUrl?: string | null;
    @Field(() => Boolean, { nullable: true }) publiclyAvailable?: boolean;
    @Field(() => Boolean, { nullable: true }) learningAvailable?: boolean;
}

@ObjectType()
export class CommerceOrderInfo {
    @Field(() => ID) id!: string;
    @Field(() => ID) courseId!: string;
    @Field(() => String) orderNumber!: string;
    @Field(() => String) courseTitleSnapshot!: string;
    @Field(() => CommercePerson, { nullable: true }) user?: CommercePerson | null;
    @Field(() => OrderStatus) status!: OrderStatus;
    @Field(() => Boolean) isTestMode!: boolean;
    @Field(() => Date) createdAt!: Date;
    @Field(() => CommerceEnrollmentReference, { nullable: true }) enrollment?: CommerceEnrollmentReference | null;
}

@ObjectType()
export class CommerceRefund {
    @Field(() => ID) id!: string;
    @Field(() => Int) amountMinorUnits!: number;
    @Field(() => String) currency!: string;
    @Field(() => RefundStatus) status!: RefundStatus;
    @Field(() => String, { nullable: true }) reason?: string | null;
    @Field(() => Date) createdAt!: Date;
}

@ObjectType()
export class CommerceDispute {
    @Field(() => ID) id!: string;
    @Field(() => Int) amountMinorUnits!: number;
    @Field(() => String) currency!: string;
    @Field(() => String) status!: string;
    @Field(() => String) reason!: string;
    @Field(() => Date) createdAt!: Date;
}

@ObjectType()
export class CommercePayment {
    @Field(() => ID) id!: string;
    @Field(() => ID) orderId!: string;
    @Field(() => PaymentProvider) provider!: PaymentProvider;
    @Field(() => PaymentStatus) status!: PaymentStatus;
    @Field(() => Int) amountMinorUnits!: number;
    @Field(() => Int) refundedMinorUnits!: number;
    @Field(() => String, { nullable: true }) receiptUrl?: string | null;
    @Field(() => String) currency!: string;
    @Field(() => Boolean) isTestMode!: boolean;
    @Field(() => Date, { nullable: true }) paidAt?: Date | null;
    @Field(() => Date) expiresAt!: Date;
    @Field(() => Date) createdAt!: Date;
    @Field(() => [CommerceRefund], { nullable: true }) refunds?: CommerceRefund[] | null;
    @Field(() => [CommerceDispute], { nullable: true }) disputes?: CommerceDispute[] | null;
    @Field(() => CommerceOrderInfo, { nullable: true }) order?: CommerceOrderInfo | null;
    @Field(() => String, { nullable: true }) failureCode?: string | null;
    @Field(() => String, { nullable: true }) failureMessage?: string | null;
}

@ObjectType()
export class AdminCommercePayment extends CommercePayment {
    @Field(() => String, { nullable: true }) stripeCheckoutSessionId?: string | null;
    @Field(() => String, { nullable: true }) stripePaymentIntentId?: string | null;
    @Field(() => String, { nullable: true }) stripeChargeId?: string | null;
    @Field(() => String, { nullable: true }) reconciliationReason?: string | null;
}

@ObjectType()
export class CommerceOrder extends CommerceOrderInfo {
    @Field(() => String) currency!: string;
    @Field(() => Int) subtotalMinorUnits!: number;
    @Field(() => Int) discountMinorUnits!: number;
    @Field(() => Int) totalMinorUnits!: number;
    @Field(() => String, { nullable: true }) reconciliationReason?: string | null;
    @Field(() => Date, { nullable: true }) paidAt?: Date | null;
    @Field(() => Date) expiresAt!: Date;
    @Field(() => Date, { nullable: true }) cancelledAt?: Date | null;
    @Field(() => Boolean, { nullable: true }) canResume?: boolean;
    @Field(() => PaymentStatus, { nullable: true }) paymentStatus?: PaymentStatus | null;
    @Field(() => CommerceCourseLink) course!: CommerceCourseLink;
    @Field(() => [CommercePayment]) payments!: CommercePayment[];
}

@ObjectType()
export class CommerceEnrollment {
    @Field(() => ID) id!: string;
    @Field(() => CommerceCourse) course!: CommerceCourse;
    @Field(() => CommercePerson, { nullable: true }) user?: CommercePerson | null;
    @Field(() => ID, { nullable: true }) orderId?: string | null;
    @Field(() => CommerceOrderReference, { nullable: true }) order?: CommerceOrderReference | null;
    @Field(() => EnrollmentSource) source!: EnrollmentSource;
    @Field(() => EnrollmentStatus) status!: EnrollmentStatus;
    @Field(() => Date) enrolledAt!: Date;
    @Field(() => Date, { nullable: true }) completedAt?: Date | null;
    @Field(() => Date, { nullable: true }) revokedAt?: Date | null;
    @Field(() => String, { nullable: true }) revocationReason?: string | null;
}

@ObjectType()
export class CommerceCourseStatus {
    @Field(() => EnrollmentStatus, { nullable: true }) enrollmentStatus?: EnrollmentStatus | null;
    @Field(() => Boolean) canAccess!: boolean;
    @Field(() => Boolean) available!: boolean;
    @Field(() => ID, { nullable: true }) pendingOrderId?: string | null;
    @Field(() => Boolean) paymentsEnabled!: boolean;
}

@ObjectType()
export class CommerceCheckoutQuote {
    @Field(() => String) currency!: string;
    @Field(() => Int) subtotalMinorUnits!: number;
    @Field(() => Int) discountMinorUnits!: number;
    @Field(() => Int) totalMinorUnits!: number;
    @Field(() => ID, { nullable: true }) pendingOrderId?: string | null;
    @Field(() => Boolean) paymentsEnabled!: boolean;
}

@ObjectType()
export class CommerceCheckoutSession {
    @Field(() => ID) orderId!: string;
    @Field(() => String) orderNumber!: string;
    @Field(() => String, { nullable: true }) checkoutUrl?: string | null;
}

@ObjectType()
export class CommerceCheckoutStatus {
    @Field(() => ID) orderId!: string;
    @Field(() => ID) courseId!: string;
    @Field(() => String) courseSlug!: string;
    @Field(() => String) orderNumber!: string;
    @Field(() => String) courseTitle!: string;
    @Field(() => OrderStatus) status!: OrderStatus;
    @Field(() => PaymentStatus, { nullable: true }) paymentStatus?: PaymentStatus | null;
    @Field(() => EnrollmentStatus, { nullable: true }) enrollmentStatus?: EnrollmentStatus | null;
    @Field(() => Int) amountMinorUnits!: number;
    @Field(() => String) currency!: string;
    @Field(() => Date, { nullable: true }) paidAt?: Date | null;
    @Field(() => Boolean) isTestMode!: boolean;
    @Field(() => Boolean) canAccess!: boolean;
    @Field(() => Boolean) canResume!: boolean;
    @Field(() => Boolean) requiresReview!: boolean;
}

@ObjectType()
export class CommerceLearningResource {
    @Field(() => ID) id!: string;
    @Field(() => String) title!: string;
    @Field(() => String) type!: string;
    @Field(() => String) url!: string;
    @Field(() => Boolean) hasManagedMedia!: boolean;
}

@ObjectType()
export class CommerceLearningLesson {
    @Field(() => ID) id!: string;
    @Field(() => String) title!: string;
    @Field(() => String) description!: string;
    @Field(() => String) type!: string;
    @Field(() => String) content!: string;
    @Field(() => String, { nullable: true }) videoUrl?: string | null;
    @Field(() => String, { nullable: true }) documentUrl?: string | null;
    @Field(() => Int, { nullable: true }) durationSeconds?: number | null;
    @Field(() => Boolean) hasManagedMedia!: boolean;
    @Field(() => [CommerceLearningResource]) resources!: CommerceLearningResource[];
}

@ObjectType()
export class CommerceLearningSection {
    @Field(() => ID) id!: string;
    @Field(() => String) title!: string;
    @Field(() => [CommerceLearningLesson]) lessons!: CommerceLearningLesson[];
}

@ObjectType()
export class CommerceLearningContent {
    @Field(() => ID) id!: string;
    @Field(() => String) title!: string;
    @Field(() => [CommerceLearningSection]) sections!: CommerceLearningSection[];
}

@ObjectType()
export class LessonCommentAuthor {
    @Field(() => String) name!: string;
}

@ObjectType()
export class LessonComment {
    @Field(() => ID) id!: string;
    @Field(() => String) body!: string;
    @Field(() => Date) createdAt!: Date;
    @Field(() => LessonCommentAuthor) author!: LessonCommentAuthor;
}

@ObjectType()
export class LessonCommentPage {
    @Field(() => [LessonComment]) items!: LessonComment[];
    @Field(() => PaginationMeta) meta!: PaginationMeta;
}

@ObjectType()
export class CommerceWebhook {
    @Field(() => ID) id!: string;
    @Field(() => String) stripeEventId!: string;
    @Field(() => String) eventType!: string;
    @Field(() => String, { nullable: true }) stripeObjectId?: string | null;
    @Field(() => WebhookStatus) status!: WebhookStatus;
    @Field(() => Int) attempts!: number;
    @Field(() => String, { nullable: true }) lastError?: string | null;
    @Field(() => Boolean) isTestMode!: boolean;
    @Field(() => Date) receivedAt!: Date;
    @Field(() => Date, { nullable: true }) processedAt?: Date | null;
}

@ObjectType()
export class CommerceEnrollmentStats {
    @Field(() => Int) total!: number;
    @Field(() => Int) active!: number;
    @Field(() => Int) completed!: number;
    @Field(() => Int) revoked!: number;
    @Field(() => Int) free!: number;
    @Field(() => Int) paid!: number;
}

@ObjectType()
export class CommerceOrderStats {
    @Field(() => Boolean) isTestMode!: boolean;
    @Field(() => Int) total!: number;
    @Field(() => Int) paid!: number;
    @Field(() => Int) pending!: number;
}

@ObjectType()
export class CommercePaymentCounts {
    @Field(() => Boolean) isTestMode!: boolean;
    @Field(() => Int) successful!: number;
    @Field(() => Int) pending!: number;
    @Field(() => Int) failed!: number;
}

@ObjectType()
export class CommercePaymentTotals {
    @Field(() => Boolean) isTestMode!: boolean;
    @Field(() => String) currency!: string;
    @Field(() => String) grossMinorUnits!: string;
    @Field(() => String) refundedMinorUnits!: string;
    @Field(() => String) netMinorUnits!: string;
}

@ObjectType()
export class CommercePaymentStats {
    @Field(() => [CommercePaymentCounts]) counts!: CommercePaymentCounts[];
    @Field(() => [CommercePaymentTotals]) totals!: CommercePaymentTotals[];
}

@ObjectType()
export class StudentCommerceOrderStats extends CommerceOrderStats {
    @Field(() => String) currency!: string;
    @Field(() => String) totalPaidMinorUnits!: string;
}

@ObjectType()
export class StudentEnrollmentCategory {
    @Field(() => ID) id!: string;
    @Field(() => String) name!: string;
}

@ObjectType()
export class StudentCommerceStats {
    @Field(() => CommerceEnrollmentStats) enrollments!: CommerceEnrollmentStats;
    @Field(() => [StudentEnrollmentCategory]) categories!: StudentEnrollmentCategory[];
    @Field(() => [StudentCommerceOrderStats]) orders!: StudentCommerceOrderStats[];
    @Field(() => CommercePaymentStats) payments!: CommercePaymentStats;
}

@ObjectType()
export class CommerceEnrollmentPage {
    @Field(() => [CommerceEnrollment]) items!: CommerceEnrollment[];
    @Field(() => PaginationMeta) meta!: PaginationMeta;
}

@ObjectType()
export class CommerceOrderPage {
    @Field(() => [CommerceOrder]) items!: CommerceOrder[];
    @Field(() => PaginationMeta) meta!: PaginationMeta;
}

@ObjectType()
export class CommercePaymentPage {
    @Field(() => [CommercePayment]) items!: CommercePayment[];
    @Field(() => PaginationMeta) meta!: PaginationMeta;
}

@ObjectType()
export class AdminCommercePaymentPage {
    @Field(() => [AdminCommercePayment]) items!: AdminCommercePayment[];
    @Field(() => PaginationMeta) meta!: PaginationMeta;
}

@ObjectType()
export class CommerceWebhookPage {
    @Field(() => [CommerceWebhook]) items!: CommerceWebhook[];
    @Field(() => PaginationMeta) meta!: PaginationMeta;
}

@InputType()
export class CheckoutStartInput {
    @Field(() => ID) @IsUUID() courseId!: string;
    @Field(() => String) @Matches(/^[A-Z]{3}$/) currency!: string;
    @Field(() => Int) @IsInt() @Min(1) @Max(99_999_999) amountMinorUnits!: number;
}

@InputType()
export class CheckoutReconcileInput {
    @Field(() => ID) @IsUUID() orderId!: string;
    @Field(() => String, { nullable: true }) @IsOptional() @MaxLength(255)
    @Matches(/^cs_test_[0-9a-zA-Z_]+$/) sessionId?: string;
}

@InputType({ isAbstract: true })
export class CommerceFilter {
    @Field(() => String, { nullable: true }) @IsOptional() @MaxLength(120) search?: string;
    @Field(() => Date, { nullable: true }) @IsOptional() @IsDate() from?: Date;
    @Field(() => Date, { nullable: true }) @IsOptional() @IsDate() to?: Date;
    @Field(() => Boolean, { nullable: true }) @IsOptional() @IsBoolean() oldestFirst?: boolean;
}

@InputType()
export class CommerceEnrollmentFilter extends CommerceFilter {
    @Field(() => EnrollmentStatus, { nullable: true }) @IsOptional() @IsEnum(EnrollmentStatus)
    status?: EnrollmentStatus;

    @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID()
    categoryId?: string;

    @Field(() => EnrollmentSource, { nullable: true }) @IsOptional() @IsEnum(EnrollmentSource)
    source?: EnrollmentSource;
}

@InputType()
export class CommerceOrderFilter extends CommerceFilter {
    @Field(() => OrderStatus, { nullable: true }) @IsOptional() @IsEnum(OrderStatus)
    status?: OrderStatus;
}

@InputType()
export class CommercePaymentFilter extends CommerceFilter {
    @Field(() => PaymentStatus, { nullable: true }) @IsOptional() @IsEnum(PaymentStatus)
    status?: PaymentStatus;
}

@InputType()
export class CommerceWebhookFilter extends CommerceFilter {
    @Field(() => WebhookStatus, { nullable: true }) @IsOptional() @IsEnum(WebhookStatus)
    status?: WebhookStatus;
}
