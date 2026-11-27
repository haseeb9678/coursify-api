import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

import { isCheckoutAddress, paymentScope } from './payment-policy.js';

export type ProviderSession = Pick<Stripe.Checkout.Session,
    'id' | 'url' | 'status' | 'payment_status' | 'livemode' | 'mode' | 'metadata' |
    'client_reference_id' | 'amount_total' | 'currency'
> & { payment_intent: string | { id: string } | null };

export type ProviderCharge = Pick<Stripe.Charge,
    'id' | 'livemode' | 'status' | 'paid' | 'captured' | 'amount_captured' | 'currency' | 'created'
> & {
    payment_intent: string | { id: string } | null;
    payment_method_details: { type: string } | null;
    receipt_url?: string | null;
};

export type ProviderIntent = Pick<Stripe.PaymentIntent,
    'id' | 'status' | 'livemode' | 'amount' | 'currency' | 'metadata' | 'amount_received'
> & {
    latest_charge: string | ProviderCharge | null;
    last_payment_error: { code?: string } | null;
};

type ProviderRefund = Pick<Stripe.Refund, 'id' | 'currency' | 'amount' | 'status' | 'reason' | 'created'> & {
    payment_intent: string | { id: string } | null;
    charge: string | { id: string } | null;
};

type ProviderDispute = Pick<Stripe.Dispute, 'id' | 'currency' | 'amount' | 'status' | 'reason' | 'created' | 'livemode'> & {
    payment_intent: string | { id: string } | null;
    charge: string | { id: string };
};

export interface ProviderMoneyDetails {
    refunds: ProviderRefund[];
    disputes: ProviderDispute[];
}

type EventReference = { sessionId: string } | { intentId: string };

interface CheckoutAttempt {
    id: string;
    orderId: string;
    currency: string;
    amountMinorUnits: number;
    expiresAt: Date;
    createdAt: Date;
    idempotencyKey: string;
    checkoutOrigin: string;
}

function objectId(value: string | { id: string } | null | undefined): string | undefined {
    return typeof value === 'string' ? value : value?.id;
}

@Injectable()
export class StripeProvider {
    private readonly stripe?: Stripe;
    private readonly signingSecret?: string;
    readonly minimums = new Map<string, number>();

    constructor(config: ConfigService) {
        const key = config.get<string>('STRIPE_SECRET_KEY');
        this.signingSecret = config.get<string>('STRIPE_WEBHOOK_SECRET');
        if (config.get<string>('PAYMENTS_ENABLED') === 'true' && key && this.signingSecret) {
            if (!key.startsWith('sk_test_') && !key.startsWith('rk_test_')) {
                throw new Error('Only Stripe Sandbox credentials are supported.');
            }
            this.stripe = new Stripe(key, {
                apiVersion: '2026-11-18.endive',
                maxNetworkRetries: 1,
                timeout: 8_000,
            });
        }
        this.minimums.set('USD', Number(config.get<string>('STRIPE_USD_MIN_MINOR_UNITS')) || 50);
        const pkrMinimum = Number(config.get<string>('STRIPE_PKR_MIN_MINOR_UNITS'));
        if (Number.isSafeInteger(pkrMinimum) && pkrMinimum > 0) this.minimums.set('PKR', pkrMinimum);
    }

    get enabled(): boolean {
        return this.stripe !== undefined;
    }

    assertConfigured(): void {
        if (!this.enabled) {
            throw new BadRequestException('Stripe Sandbox checkout is unavailable. Ask the site administrator to configure payments.');
        }
    }

    private client(): Stripe {
        if (!this.stripe) throw new ServiceUnavailableException('Stripe Sandbox is not configured.');
        return this.stripe;
    }

    verifyEvent(rawBody: Buffer | undefined, signature: string | undefined): Stripe.Event {
        if (!rawBody || !signature) throw new BadRequestException('Stripe signature and raw request are required.');
        const stripe = this.client();
        const signingSecret = this.signingSecret;
        if (!signingSecret) throw new ServiceUnavailableException('Stripe webhook signing is not configured.');
        let event: Stripe.Event;
        try {
            event = stripe.webhooks.constructEvent(rawBody, signature, signingSecret);
        } catch {
            throw new BadRequestException('Invalid Stripe webhook signature.');
        }
        if (event.livemode || event.account || event.context || !event.id || !event.type || !event.data?.object) {
            throw new BadRequestException('Unexpected Stripe webhook environment or account.');
        }
        return event;
    }

    async createSession(attempt: CheckoutAttempt, title: string): Promise<ProviderSession> {
        const metadata = { scope: paymentScope, orderId: attempt.orderId, paymentId: attempt.id };
        const query = `order=${encodeURIComponent(attempt.orderId)}`;
        const result = await this.request(() => this.client().checkout.sessions.create({
            mode: 'payment',
            allowed_payment_method_types: ['card'],
            client_reference_id: attempt.orderId,
            metadata,
            payment_intent_data: { metadata },
            expires_at: Math.floor(attempt.expiresAt.getTime() / 1000),
            success_url: `${attempt.checkoutOrigin}/checkout/success?${query}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${attempt.checkoutOrigin}/checkout/cancel?${query}`,
            adaptive_pricing: { enabled: false },
            line_items: [{
                quantity: 1,
                price_data: {
                    currency: attempt.currency.toLowerCase(),
                    unit_amount: attempt.amountMinorUnits,
                    product_data: { name: title },
                },
            }],
        }, { idempotencyKey: attempt.idempotencyKey }));
        return result;
    }

    retrieveSession(id: string): Promise<ProviderSession> {
        return this.request(() => this.client().checkout.sessions.retrieve(id));
    }

    retrieveIntent(id: string): Promise<ProviderIntent> {
        return this.request(() => this.client().paymentIntents.retrieve(id, { expand: ['latest_charge'] }));
    }

    async sessionForIntent(id: string): Promise<ProviderSession | null> {
        const sessions = await this.request(() => this.client().checkout.sessions.list({ payment_intent: id, limit: 2 }));
        if (sessions.has_more || sessions.data.length > 1) {
            throw new ServiceUnavailableException('Stripe returned ambiguous checkout records.');
        }
        return sessions.data[0] ?? null;
    }

    async recoverSession(attempt: CheckoutAttempt): Promise<ProviderSession | null> {
        const candidates: Stripe.Checkout.Session[] = [];
        const created = {
            gte: Math.floor(attempt.createdAt.getTime() / 1000) - 60,
            lte: Math.floor(attempt.expiresAt.getTime() / 1000),
        };
        const sessions = this.client().checkout.sessions.list({ created, limit: 100 });
        await this.request(async () => {
            let count = 0;
            for await (const session of sessions) {
                if (session.metadata?.scope === paymentScope && session.metadata.paymentId === attempt.id) {
                    candidates.push(session);
                }
                if (++count >= 1_000) throw new ServiceUnavailableException('Stripe session recovery needs operator review.');
            }
        });
        if (candidates.length > 1) throw new ServiceUnavailableException('Stripe returned ambiguous checkout records.');
        return candidates[0] ?? null;
    }

    async moneyDetails(intentId: string): Promise<ProviderMoneyDetails> {
        const all = await this.request(() => Promise.all([
            this.client().refunds.list({ payment_intent: intentId, limit: 100 }).autoPagingToArray({ limit: 1_001 }),
            this.client().disputes.list({ payment_intent: intentId, limit: 100 }).autoPagingToArray({ limit: 1_001 }),
        ]));
        if (all.some((items) => items.length > 1_000)) {
            throw new ServiceUnavailableException('Stripe payment history needs operator review.');
        }
        return { refunds: all[0], disputes: all[1] };
    }

    checkoutUrl(session: ProviderSession): string | null {
        return session.status === 'open' && session.url && isCheckoutAddress(session.url) ? session.url : null;
    }

    async eventReference(event: Stripe.Event): Promise<EventReference | null> {
        switch (event.type) {
            case 'checkout.session.completed':
            case 'checkout.session.expired':
            case 'checkout.session.async_payment_succeeded':
            case 'checkout.session.async_payment_failed':
                return { sessionId: event.data.object.id };
            case 'payment_intent.payment_failed':
            case 'payment_intent.succeeded':
                return { intentId: event.data.object.id };
            case 'charge.refunded':
            case 'refund.created':
            case 'refund.updated':
            case 'refund.failed':
            case 'charge.dispute.created':
            case 'charge.dispute.updated':
            case 'charge.dispute.closed':
            case 'charge.dispute.funds_withdrawn':
            case 'charge.dispute.funds_reinstated': {
                const intent = objectId(event.data.object.payment_intent);
                if (intent) return { intentId: intent };
                const object = event.data.object;
                if (!('charge' in object)) return null;
                const chargeId = objectId(object.charge);
                if (!chargeId) return null;
                const charge = await this.request(() => this.client().charges.retrieve(chargeId));
                const foundIntent = objectId(charge.payment_intent);
                return foundIntent ? { intentId: foundIntent } : null;
            }
            default:
                return null;
        }
    }

    private async request<T>(operation: () => Promise<T>): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code &&
                ['currency_not_supported', 'amount_too_small', 'amount_too_large', 'payment_method_currency_mismatch'].includes(error.code)) {
                throw new BadRequestException('The configured Stripe Sandbox account cannot process this course currency or amount.');
            }
            throw new ServiceUnavailableException('Stripe is temporarily unavailable. The current attempt is safe to check again.');
        }
    }
}

export { objectId };
