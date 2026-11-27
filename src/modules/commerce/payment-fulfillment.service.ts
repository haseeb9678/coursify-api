import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { RefundStatus, WebhookStatus } from '../../generated/prisma/enums.js';
import { CommerceStore } from './commerce.store.js';
import { grantsAccess, isCommerceUuid, paymentScope, stripeReceiptAddress } from './payment-policy.js';
import { objectId, StripeProvider, type ProviderCharge, type ProviderIntent, type ProviderMoneyDetails, type ProviderSession } from './stripe.provider.js';

const paymentContext = { order: { include: { user: { select: { status: true, role: true } }, course: { select: { status: true } } } } } satisfies Prisma.PaymentInclude;
type PaymentContext = Prisma.PaymentGetPayload<{ include: typeof paymentContext }>;
export interface EventClaim { stripeEventId: string; token: string }

const badEvidence = () => new BadRequestException('Stripe payment references, amount, or currency could not be verified.');

function matchesMetadata(metadata: ProviderSession['metadata'], payment: PaymentContext): boolean {
    return metadata?.scope === paymentScope &&
        metadata?.paymentId === payment.id && metadata?.orderId === payment.orderId;
}

function refundStatus(status: string | null | undefined): RefundStatus {
    switch (status) {
        case 'succeeded': return 'SUCCEEDED';
        case 'failed': return 'FAILED';
        case 'canceled': return 'CANCELLED';
        case 'requires_action': return 'REQUIRES_ACTION';
        case 'pending': return 'PENDING';
        default: throw badEvidence();
    }
}

@Injectable()
export class PaymentFulfillmentService {
    constructor(private readonly store: CommerceStore, private readonly stripe: StripeProvider) {}

    async fromSession(session: ProviderSession, claim?: EventClaim, expectedPaymentId?: string, eventType?: string) {
        if (session.metadata?.scope !== paymentScope && !expectedPaymentId) return false;
        const paymentId = expectedPaymentId ?? session.metadata?.paymentId;
        if (!isCommerceUuid(paymentId)) throw badEvidence();
        const payment = await this.store.prisma.payment.findUnique({ where: { id: paymentId }, include: paymentContext });
        if (!payment) throw badEvidence();

        const intentId = objectId(session.payment_intent);
        const intent = intentId ? await this.stripe.retrieveIntent(intentId) : null;
        this.verifyReferences(payment, session, intent);
        const charge = intent?.latest_charge;
        const confirmed = session.status === 'complete' && session.payment_status === 'paid' &&
            intent?.status === 'succeeded';
        if (session.payment_status === 'paid' && !confirmed) throw badEvidence();

        if (confirmed) {
            if (!charge || typeof charge === 'string' || charge.livemode || !charge.paid || !charge.captured ||
                charge.status !== 'succeeded' || charge.payment_method_details?.type !== 'card' || charge.amount_captured !== payment.amountMinorUnits ||
                charge.currency !== payment.currency.toLowerCase() || objectId(charge.payment_intent) !== intent.id ||
                intent.amount_received !== payment.amountMinorUnits ||
                (payment.stripeChargeId && payment.stripeChargeId !== charge.id)) throw badEvidence();

            const details = await this.stripe.moneyDetails(intent.id);
            await this.store.transaction(async (tx) => {
                const current = await this.requireCurrent(tx, payment);
                await this.applyConfirmed(tx, current, session.id, intent.id, charge, details);
                if (claim) await this.finishEvent(tx, claim, 'PROCESSED');
            });
        } else {
            await this.store.transaction(async (tx) => {
                const current = await this.requireCurrent(tx, payment);
                // Older failures and expirations cannot replace a captured payment.
                if (!current.paidAt) {
                    const terminal = session.status === 'expired' ? 'EXPIRED'
                        : session.status === 'complete' && (
                            intent?.status === 'canceled' ||
                            (eventType === 'checkout.session.async_payment_failed' && intent?.status === 'requires_payment_method')
                        ) ? 'FAILED' : null;
                    const failure = intent?.last_payment_error?.code;
                    await tx.payment.update({
                        where: { id: current.id },
                        data: {
                            stripeCheckoutSessionId: session.id,
                            ...(intentId && { stripePaymentIntentId: intentId }),
                            ...(current.status === 'PENDING' || current.status === 'PROCESSING' ? {
                                status: terminal ?? (session.status === 'complete' || current.status === 'PROCESSING' ? 'PROCESSING' : 'PENDING'),
                            } : {}),
                            ...(failure && /^[a-z0-9_]{1,120}$/.test(failure) && {
                                failureCode: failure, failureMessage: 'Stripe reported an unsuccessful card payment.',
                            }),
                            reconciliationReason: null,
                            lastCheckedAt: new Date(),
                            reconciliationVersion: { increment: 1 },
                        },
                    });
                    if (terminal) {
                        await tx.purchaseOrder.updateMany({
                            where: { id: current.orderId, status: 'PENDING' },
                            data: { status: terminal },
                        });
                    }
                }
                if (claim) await this.finishEvent(tx, claim, 'PROCESSED');
            });
        }
        return true;
    }

    private verifyReferences(payment: PaymentContext, session: ProviderSession, intent: ProviderIntent | null): void {
        const currency = payment.currency.toLowerCase();
        if (session.livemode || !payment.isTestMode || !payment.order.isTestMode || session.mode !== 'payment' ||
            !matchesMetadata(session.metadata, payment) || session.client_reference_id !== payment.orderId ||
            session.amount_total !== payment.amountMinorUnits || session.currency !== currency ||
            payment.order.totalMinorUnits !== payment.amountMinorUnits || payment.order.currency !== payment.currency ||
            (payment.stripeCheckoutSessionId && payment.stripeCheckoutSessionId !== session.id) ||
            (payment.stripePaymentIntentId && payment.stripePaymentIntentId !== objectId(session.payment_intent)) ||
            (intent && (intent.livemode || !matchesMetadata(intent.metadata, payment) ||
                intent.amount !== payment.amountMinorUnits || intent.currency !== currency ||
                intent.id !== objectId(session.payment_intent)))) throw badEvidence();
    }

    private async requireCurrent(tx: Prisma.TransactionClient, payment: PaymentContext) {
        const current = await tx.payment.findUnique({ where: { id: payment.id }, include: paymentContext });
        if (!current || current.reconciliationVersion !== payment.reconciliationVersion) {
            throw new ServiceUnavailableException('Payment state changed during verification. Try again.');
        }
        return current;
    }

    private async applyConfirmed(
        tx: Prisma.TransactionClient,
        payment: PaymentContext,
        sessionId: string,
        intentId: string,
        charge: ProviderCharge,
        details: ProviderMoneyDetails,
    ) {
        const paidAt = payment.paidAt ?? new Date(charge.created * 1000);
        const receiptUrl = stripeReceiptAddress(charge.receipt_url);
        const currency = payment.currency.toLowerCase();
        for (const refund of details.refunds) {
            if (refund.currency !== currency ||
                (objectId(refund.payment_intent) !== intentId && objectId(refund.charge) !== charge.id) ||
                !Number.isSafeInteger(refund.amount) || refund.amount <= 0 || refund.amount > payment.amountMinorUnits) {
                throw badEvidence();
            }
            const data = {
                amountMinorUnits: refund.amount,
                currency: payment.currency,
                status: refundStatus(refund.status),
                reason: refund.reason ?? null,
            };
            await tx.refund.upsert({
                where: { stripeRefundId: refund.id, paymentId: payment.id },
                create: { ...data, stripeRefundId: refund.id, paymentId: payment.id, createdAt: new Date(refund.created * 1000) },
                update: data,
            });
        }
        for (const dispute of details.disputes) {
            if (dispute.livemode || dispute.currency !== currency ||
                (objectId(dispute.payment_intent) !== intentId && objectId(dispute.charge) !== charge.id) ||
                !Number.isSafeInteger(dispute.amount) || dispute.amount <= 0) throw badEvidence();
            const data = { amountMinorUnits: dispute.amount, currency: payment.currency, status: dispute.status, reason: dispute.reason };
            await tx.paymentDispute.upsert({
                where: { stripeDisputeId: dispute.id, paymentId: payment.id },
                create: { ...data, stripeDisputeId: dispute.id, paymentId: payment.id, createdAt: new Date(dispute.created * 1000) },
                update: data,
            });
        }
        const aggregate = await tx.refund.aggregate({
            where: { paymentId: payment.id, status: 'SUCCEEDED' }, _sum: { amountMinorUnits: true },
        });
        const refunded = aggregate._sum.amountMinorUnits ?? 0;
        if (refunded > payment.amountMinorUnits) throw badEvidence();
        const disputes = await tx.paymentDispute.findMany({
            where: { paymentId: payment.id }, select: { status: true },
        });
        const disputeLost = disputes.some(({ status }) => status === 'lost');
        const disputeOpen = disputes.some(({ status }) =>
            ['needs_response', 'under_review', 'warning_needs_response', 'warning_under_review'].includes(status));
        const fullRefund = refunded === payment.amountMinorUnits;
        const enrollment = await tx.enrollment.findUnique({
            where: { userId_courseId: { userId: payment.order.userId, courseId: payment.order.courseId } },
        });
        const duplicate = !!(payment.order.successfulPaymentId && payment.order.successfulPaymentId !== payment.id) ||
            (!payment.paidAt && grantsAccess(enrollment?.status) && enrollment?.orderId !== payment.orderId);
        const temporaryReasons = ['CHECKOUT_SESSION_UNCONFIRMED', 'OPEN_DISPUTE', 'DISPUTE_LOST'];
        const previousReason = payment.reconciliationReason && !temporaryReasons.includes(payment.reconciliationReason)
            ? payment.reconciliationReason : null;
        const entitlementConflict = duplicate ? 'DUPLICATE_PAYMENT' : previousReason ??
            (!payment.paidAt && enrollment && !grantsAccess(enrollment.status) ? 'EXISTING_INACTIVE_ENROLLMENT'
                : payment.order.course.status !== 'PUBLISHED' && !enrollment ? 'COURSE_UNAVAILABLE'
                : (payment.order.user.status !== 'ACTIVE' || payment.order.user.role !== 'STUDENT') && !enrollment
                    ? 'STUDENT_UNAVAILABLE' : null);
        const reconciliationReason = entitlementConflict ?? (disputeLost ? 'DISPUTE_LOST' : disputeOpen ? 'OPEN_DISPUTE' : null);
        await tx.payment.update({
            where: { id: payment.id },
            data: {
                status: fullRefund ? 'REFUNDED' : refunded ? 'PARTIALLY_REFUNDED' : 'SUCCEEDED',
                stripeCheckoutSessionId: sessionId,
                stripePaymentIntentId: intentId,
                stripeChargeId: charge.id,
                ...(receiptUrl && { receiptUrl }),
                refundedMinorUnits: refunded,
                paidAt, reconciliationReason, lastCheckedAt: new Date(),
                reconciliationVersion: { increment: 1 },
            },
        });

        const ownsSuccess = !payment.order.successfulPaymentId || payment.order.successfulPaymentId === payment.id;
        await tx.purchaseOrder.update({
            where: { id: payment.orderId },
            data: ownsSuccess ? {
                status: fullRefund ? 'REFUNDED' : refunded ? 'PARTIALLY_REFUNDED' : 'PAID',
                successfulPaymentId: payment.id,
                paidAt: payment.order.paidAt ?? paidAt,
                reconciliationReason,
            } : { reconciliationReason: 'DUPLICATE_PAYMENT' },
        });
        if (!enrollment && ownsSuccess && !fullRefund && !disputeLost && !entitlementConflict) {
            await tx.enrollment.create({
                data: { userId: payment.order.userId, courseId: payment.order.courseId, orderId: payment.orderId, source: 'PAID' },
            });
        }
        if (enrollment?.source === 'PAID' && enrollment.orderId === payment.orderId &&
            grantsAccess(enrollment.status) && ownsSuccess && (fullRefund || disputeLost)) {
            await this.reconcileEntitlement(tx, enrollment.id, payment, fullRefund);
        }
    }

    private async reconcileEntitlement(tx: Prisma.TransactionClient, enrollmentId: string, payment: PaymentContext, fullRefund: boolean) {
        const alternative = await tx.purchaseOrder.findFirst({
            where: {
                id: { not: payment.orderId },
                userId: payment.order.userId,
                courseId: payment.order.courseId,
                isTestMode: payment.isTestMode,
                status: { in: ['PAID', 'PARTIALLY_REFUNDED'] },
                successfulPayment: { is: { disputes: { none: { status: 'lost' } } } },
            },
            orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
            select: { id: true },
        });
        await tx.enrollment.update({
            where: { id: enrollmentId },
            data: alternative ? { orderId: alternative.id } : {
                status: 'REVOKED', revokedAt: new Date(),
                revocationReason: fullRefund ? 'FULL_REFUND' : 'DISPUTE_LOST',
            },
        });
    }

    async finishEvent(tx: Prisma.TransactionClient, claim: EventClaim, status: 'PROCESSED' | 'IGNORED'): Promise<void> {
        const result = await tx.webhookEvent.updateMany({
            where: { stripeEventId: claim.stripeEventId, status: WebhookStatus.PROCESSING, leaseToken: claim.token },
            data: { status, processedAt: new Date(), leaseToken: null, leaseUntil: null, lastError: null },
        });
        if (result.count !== 1) throw new ServiceUnavailableException('Webhook processing lease changed. Retry the event.');
    }
}
