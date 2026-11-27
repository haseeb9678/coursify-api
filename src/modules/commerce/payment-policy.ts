import { BadRequestException, ConflictException } from '@nestjs/common';
import type { CoursePricingType, EnrollmentStatus, OrderStatus, PaymentStatus } from '../../generated/prisma/enums.js';

export const checkoutLifetimeMs = 60 * 60 * 1000;
export const providerMinimumLifetimeMs = 31 * 60 * 1000;
export const providerRetryWindowMs = 23 * 60 * 60 * 1000;
export const maxChargeMinorUnits = 99_999_999;

export const grantsAccess = (status?: EnrollmentStatus | null): boolean =>
    status === 'ACTIVE' || status === 'COMPLETED';

export function canResumeCheckout(
    orderStatus: OrderStatus,
    attempt?: { status: PaymentStatus; expiresAt: Date; reconciliationReason: string | null },
): boolean {
    return orderStatus === 'PENDING' && attempt?.status === 'PENDING' &&
        attempt.expiresAt.getTime() > Date.now() && !attempt.reconciliationReason;
}

interface CoursePricing {
    pricingType: CoursePricingType;
    currency: string;
    priceMinorUnits: number;
    discountedPriceMinorUnits: number | null;
}

export function purchasePrice(course: CoursePricing, minimums: ReadonlyMap<string, number>) {
    if (course.pricingType !== 'PAID') {
        throw new BadRequestException('This course can be enrolled in for free.');
    }
    const minimum = minimums.get(course.currency);
    if (!minimum) {
        throw new BadRequestException(`Stripe Sandbox checkout is not configured for ${course.currency}.`);
    }
    const subtotalMinorUnits = course.priceMinorUnits;
    const totalMinorUnits = course.discountedPriceMinorUnits ?? subtotalMinorUnits;
    if (
        !Number.isSafeInteger(subtotalMinorUnits) || subtotalMinorUnits <= 0 ||
        !Number.isSafeInteger(totalMinorUnits) || totalMinorUnits < minimum ||
        totalMinorUnits > subtotalMinorUnits || totalMinorUnits > maxChargeMinorUnits
    ) {
        throw new BadRequestException('The course price is outside the configured Stripe limits.');
    }
    return {
        currency: course.currency,
        subtotalMinorUnits,
        totalMinorUnits,
        discountMinorUnits: subtotalMinorUnits - totalMinorUnits,
    };
}

export function assertPriceConfirmed(
    price: { currency: string; totalMinorUnits: number },
    confirmed: { currency: string; amountMinorUnits: number },
): void {
    if (price.currency !== confirmed.currency || price.totalMinorUnits !== confirmed.amountMinorUnits) {
        throw new ConflictException('The price has changed. Review the updated checkout total and try again.');
    }
}

export function requiresProviderRecovery(createdAt: Date, expiresAt: Date, now: number): boolean {
    return now - createdAt.getTime() >= providerRetryWindowMs ||
        expiresAt.getTime() - now < providerMinimumLifetimeMs;
}

export function isCheckoutAddress(value: string): boolean {
    try {
        const url = new URL(value);
        return url.origin === 'https://checkout.stripe.com' &&
            url.username === '' && url.password === '' && url.pathname.startsWith('/c/pay/');
    } catch {
        return false;
    }
}

export function stripeReceiptAddress(value?: string | null): string | undefined {
    if (!value || value.length > 2048) return undefined;
    try {
        const url = new URL(value);
        return url.href.length <= 2048 && url.origin === 'https://pay.stripe.com' &&
            !url.username && !url.password && url.pathname.startsWith('/receipts/payment/') ? url.href : undefined;
    } catch {
        return undefined;
    }
}

export const paymentScope = 'coursify-course-v1';

export function isCommerceUuid(value: string | undefined): value is string {
    return typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}
