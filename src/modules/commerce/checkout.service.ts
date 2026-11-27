import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Payment } from '../../generated/prisma/client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { CommerceStore } from './commerce.store.js';
import { PaymentFulfillmentService } from './payment-fulfillment.service.js';
import {
    assertPriceConfirmed, canResumeCheckout, checkoutLifetimeMs, grantsAccess, purchasePrice, requiresProviderRecovery,
} from './payment-policy.js';
import { StripeProvider } from './stripe.provider.js';

interface PriceConfirmation { currency: string; amountMinorUnits: number }

const pendingAttempts = ['PENDING', 'PROCESSING'] as const;
const attemptOrder = [{ createdAt: 'desc' }, { id: 'desc' }] satisfies Prisma.PaymentOrderByWithRelationInput[];

@Injectable()
export class CheckoutService {
    private readonly frontendOrigin: string;

    constructor(
        private readonly store: CommerceStore,
        private readonly stripe: StripeProvider,
        private readonly fulfillment: PaymentFulfillmentService,
        config: ConfigService,
    ) {
        this.frontendOrigin = config.getOrThrow<string>('app.frontendUrl');
    }

    async courseStatus(userId: string, courseId: string) {
        const [course, enrollment, pendingOrder] = await Promise.all([
            this.store.prisma.course.findUnique({ where: { id: courseId }, select: { status: true, pricingType: true } }),
            this.store.prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } }),
            this.store.prisma.purchaseOrder.findFirst({
                where: { userId, courseId, status: 'PENDING', isTestMode: true }, select: { id: true },
            }),
        ]);
        return {
            enrollmentStatus: enrollment?.status ?? null,
            canAccess: grantsAccess(enrollment?.status),
            available: course?.status === 'PUBLISHED' && !enrollment,
            pendingOrderId: pendingOrder?.id ?? null,
            paymentsEnabled: this.stripe.enabled,
        };
    }

    async quote(userId: string, courseId: string) {
        return this.store.transaction(async (tx) => {
            const { course, pending } = await this.checkAvailability(tx, userId, courseId);
            const price = pending ?? purchasePrice(course, this.stripe.minimums);
            return {
                currency: price.currency,
                subtotalMinorUnits: price.subtotalMinorUnits,
                discountMinorUnits: price.discountMinorUnits,
                totalMinorUnits: price.totalMinorUnits,
                pendingOrderId: pending?.id ?? null,
                paymentsEnabled: this.stripe.enabled,
            };
        });
    }

    async start(userId: string, courseId: string, confirmed: PriceConfirmation) {
        this.stripe.assertConfigured();
        await this.store.throttle(userId);
        const { attempt, order } = await this.store.transaction(async (tx) => {
            await this.store.assertStudent(tx, userId);
            const { course, pending } = await this.checkAvailability(tx, userId, courseId);

            if (pending) {
                assertPriceConfirmed(pending, confirmed);
                const attempt = await tx.payment.findFirst({
                    where: { orderId: pending.id, status: { in: [...pendingAttempts] } }, orderBy: attemptOrder,
                });
                if (!attempt) throw new ServiceUnavailableException('The checkout attempt needs reconciliation.');
                return { order: pending, attempt };
            }

            const price = purchasePrice(course, this.stripe.minimums);
            assertPriceConfirmed(price, confirmed);
            const orderId = randomUUID();
            const paymentId = randomUUID();
            const expiresAt = new Date(Math.floor((Date.now() + checkoutLifetimeMs) / 1000) * 1000);
            const order = await tx.purchaseOrder.create({
                data: {
                    id: orderId, orderNumber: `C-${orderId.toUpperCase()}`,
                    userId, courseId, courseTitleSnapshot: course.title, ...price, expiresAt,
                },
            });
            const attempt = await tx.payment.create({
                data: {
                    id: paymentId, orderId, amountMinorUnits: price.totalMinorUnits,
                    currency: price.currency, expiresAt,
                    idempotencyKey: `coursify:checkout:${paymentId}`, checkoutOrigin: this.frontendOrigin,
                },
            });
            return { order, attempt };
        });

        const session = attempt.stripeCheckoutSessionId
            ? await this.stripe.retrieveSession(attempt.stripeCheckoutSessionId)
            : requiresProviderRecovery(attempt.createdAt, attempt.expiresAt, Date.now())
                ? await this.stripe.recoverSession(attempt)
                : await this.stripe.createSession(attempt, order.courseTitleSnapshot);

        if (!session) {
            await this.flagUnconfirmed(attempt);
            return { orderId: order.id, orderNumber: order.orderNumber, checkoutUrl: null };
        }

        await this.fulfillment.fromSession(session, undefined, attempt.id);
        const current = await this.status(userId, order.id);
        const checkoutUrl = current.canResume ? this.stripe.checkoutUrl(session) : null;
        if (current.canResume && session.status === 'open' && !checkoutUrl) {
            throw new BadRequestException('Stripe returned an unsupported hosted checkout address. Contact the site administrator.');
        }
        return {
            orderId: order.id,
            orderNumber: order.orderNumber,
            checkoutUrl,
        };
    }

    async status(userId: string, orderId: string) {
        const order = await this.ownedOrder(userId, orderId);
        const attempt = order.payments.find((payment) => payment.id === order.successfulPaymentId) ?? order.payments[0];
        const enrollmentStatus = order.course.enrollments[0]?.status ?? null;
        return {
            orderId: order.id, courseId: order.courseId, courseSlug: order.course.slug,
            orderNumber: order.orderNumber, courseTitle: order.courseTitleSnapshot,
            status: order.status, paymentStatus: attempt?.status ?? null, enrollmentStatus,
            amountMinorUnits: order.totalMinorUnits, currency: order.currency, paidAt: order.paidAt,
            isTestMode: order.isTestMode,
            canAccess: grantsAccess(enrollmentStatus),
            canResume: canResumeCheckout(order.status, attempt),
            requiresReview: !!(order.reconciliationReason || attempt?.reconciliationReason),
        };
    }

    async reconcile(userId: string, orderId: string, sessionReference?: string) {
        const order = await this.ownedOrder(userId, orderId);
        this.stripe.assertConfigured();
        await this.store.throttle(userId);
        const attempt = order.payments.find((payment) => payment.id === order.successfulPaymentId) ?? order.payments[0];
        if (!attempt) return this.status(userId, orderId);
        const knownSession = attempt.stripeCheckoutSessionId;
        if (sessionReference && knownSession && sessionReference !== knownSession) {
            throw new NotFoundException('Checkout reference not found for this order.');
        }
        if (!sessionReference && attempt.lastCheckedAt &&
            Date.now() - attempt.lastCheckedAt.getTime() < 4_000 && !attempt.reconciliationReason) {
            return this.status(userId, orderId);
        }

        const sessionId = knownSession ?? sessionReference;
        const session = sessionId
            ? await this.stripe.retrieveSession(sessionId)
            : requiresProviderRecovery(attempt.createdAt, attempt.expiresAt, Date.now())
                ? await this.stripe.recoverSession(attempt)
                : null;
        if (session) {
            await this.fulfillment.fromSession(session, undefined, attempt.id);
        } else if (requiresProviderRecovery(attempt.createdAt, attempt.expiresAt, Date.now())) {
            await this.flagUnconfirmed(attempt);
        }
        return this.status(userId, orderId);
    }

    private async checkAvailability(tx: Prisma.TransactionClient, userId: string, courseId: string) {
        const enrollment = await tx.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
        if (enrollment) {
            throw new ConflictException(grantsAccess(enrollment.status)
                ? 'You already have access to this course.'
                : 'A previous enrollment requires administrator review.');
        }
        const course = await this.store.publishedCourse(tx, courseId);
        if (course.pricingType !== 'PAID') throw new ConflictException('This course is available for free enrollment.');
        const pending = await tx.purchaseOrder.findFirst({
            where: { userId, courseId, status: 'PENDING', isTestMode: true },
        });
        return { course, pending };
    }

    private async ownedOrder(userId: string, orderId: string) {
        const order = await this.store.prisma.purchaseOrder.findUnique({
            where: { id: orderId, userId, isTestMode: true },
            include: {
                payments: { orderBy: attemptOrder, take: 20 },
                course: { select: { slug: true, enrollments: { where: { userId }, select: { status: true }, take: 1 } } },
            },
        });
        if (!order) throw new NotFoundException('Order not found.');
        return order;
    }

    private async flagUnconfirmed(attempt: Payment) {
        await this.store.prisma.payment.updateMany({
            where: { id: attempt.id, stripeCheckoutSessionId: null, paidAt: null, status: { in: [...pendingAttempts] } },
            data: { reconciliationReason: 'CHECKOUT_SESSION_UNCONFIRMED', lastCheckedAt: new Date() },
        });
    }
}
