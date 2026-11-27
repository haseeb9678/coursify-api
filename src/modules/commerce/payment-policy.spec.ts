import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import Stripe from 'stripe';
import request from 'supertest';
import type { Server } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { StripeWebhookController } from './stripe-webhook.controller.js';
import { StripeWebhookService } from './stripe-webhook.service.js';
import { AdminCommerceResolver, StudentCommerceResolver } from './commerce.resolvers.js';
import { assertPriceConfirmed, grantsAccess, isCheckoutAddress, purchasePrice, requiresProviderRecovery } from './payment-policy.js';
import { StripeProvider } from './stripe.provider.js';

const minimums = new Map([['USD', 50], ['PKR', 15_000]]);
const secret = 'whsec_commerce_test';
const testStripe = new Stripe('sk_test_commerce');
const stripe = new StripeProvider(new ConfigService({
    PAYMENTS_ENABLED: 'true', STRIPE_SECRET_KEY: 'sk_test_commerce', STRIPE_WEBHOOK_SECRET: secret,
}));

function sign(livemode = false) {
    const payload = JSON.stringify({
        id: 'evt_checkout_signed', type: 'checkout.session.completed', livemode,
        data: { object: { id: 'cs_test_unit', object: 'checkout.session' } },
    });
    return {
        bytes: Buffer.from(payload),
        signature: testStripe.webhooks.generateTestHeaderString({ payload, secret }),
    };
}

describe('checkout policy', () => {
    it('keeps integer minor units and confirms the real discounted price', () => {
        const quote = purchasePrice({
            pricingType: 'PAID', currency: 'PKR', priceMinorUnits: 499900, discountedPriceMinorUnits: 399900,
        }, minimums);
        expect(quote).toEqual({ currency: 'PKR', subtotalMinorUnits: 499900, discountMinorUnits: 100000, totalMinorUnits: 399900 });
        expect(() => assertPriceConfirmed(quote, { currency: 'PKR', amountMinorUnits: 399900 })).not.toThrow();
        expect(() => assertPriceConfirmed(quote, { currency: 'PKR', amountMinorUnits: 3999 })).toThrow(/price has changed/);
    });

    it('rejects unsupported currencies, invalid discounts, and provider limit violations', () => {
        const course = { pricingType: 'PAID' as const, currency: 'USD', priceMinorUnits: 100, discountedPriceMinorUnits: null };
        expect(() => purchasePrice({ ...course, currency: 'JPY' }, minimums)).toThrow(/not configured/);
        for (const amount of [0, 49, 100.5, 200]) {
            expect(() => purchasePrice({ ...course, discountedPriceMinorUnits: amount }, minimums)).toThrow(/Stripe limits/);
        }
        expect(() => purchasePrice({ ...course, priceMinorUnits: 100_000_000 }, minimums)).toThrow(/Stripe limits/);
    });

    it('accepts only the Stripe-hosted payment origin and formats', () => {
        expect(isCheckoutAddress('https://checkout.stripe.com/c/pay/cs_test_paid')).toBe(true);
        for (const source of [
            'https://checkout.stripe.com.example.test/c/pay/cs_test_paid', 'http://checkout.stripe.com/c/pay/cs_test_paid',
            'https://user@checkout.stripe.com/c/pay/cs_test_paid', 'https://checkout.stripe.com/other',
        ]) expect(isCheckoutAddress(source)).toBe(false);
    });

    it('requires provider lookup before expired session parameters or idempotency keys can be reused', () => {
        const now = Date.now();
        expect(requiresProviderRecovery(new Date(now), new Date(now + 3_600_000), now)).toBe(false);
        expect(requiresProviderRecovery(new Date(now - 500_000), new Date(now + 900_000), now)).toBe(true);
        expect(requiresProviderRecovery(new Date(now - 86_400_000), new Date(now + 3_600_000), now)).toBe(true);
        expect(['ACTIVE', 'COMPLETED', 'REVOKED', 'CANCELLED'].map((status) => status === 'ACTIVE' || status === 'COMPLETED')).toEqual([
            grantsAccess('ACTIVE'), grantsAccess('COMPLETED'), grantsAccess('REVOKED'), grantsAccess('CANCELLED'),
        ]);
    });

    it('verifies raw Stripe signatures and rejects tampering, missing signatures, and live events', () => {
        const valid = sign();
        expect(stripe.verifyEvent(valid.bytes, valid.signature).id).toBe('evt_checkout_signed');
        expect(() => stripe.verifyEvent(Buffer.from(valid.bytes.toString() + ' '), valid.signature)).toThrow(/Invalid Stripe/);
        expect(() => stripe.verifyEvent(valid.bytes, undefined)).toThrow(/required/);
        const live = sign(true);
        expect(() => stripe.verifyEvent(live.bytes, live.signature)).toThrow(/environment/);
        expect(new StripeProvider(new ConfigService({})).enabled).toBe(false);
    });


    it('verifies the original HTTP request bytes at the dedicated webhook route', async () => {
        const handled = vi.fn((raw: Buffer | undefined, signature: string | undefined) => {
            stripe.verifyEvent(raw, signature);
        });
        const fixture = await Test.createTestingModule({
            controllers: [StripeWebhookController],
            providers: [{ provide: StripeWebhookService, useValue: { handle: handled } }],
        }).compile();
        const app: INestApplication<Server> = fixture.createNestApplication({ rawBody: true });
        try {
            await app.init();
            const api = request(app.getHttpServer());
            const valid = sign();
            await api.post('/webhooks/stripe')
                .set('Content-Type', 'application/json').set('stripe-signature', valid.signature)
                .send(valid.bytes.toString()).expect(200, { received: true });
            expect(handled).toHaveBeenCalledWith(valid.bytes, valid.signature);
            await api.post('/webhooks/stripe').set('Content-Type', 'application/json')
                .send(valid.bytes.toString()).expect(400);
            await api.post('/webhooks/stripe')
                .set('Content-Type', 'application/json').set('stripe-signature', valid.signature)
                .send(valid.bytes.toString() + ' ').expect(400);
        } finally {
            await app.close();
        }
    });

    it('registers the student and admin GraphQL types and operations', async () => {
        const module = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
        try {
            await module.init();
            const schema = await module.get(GraphQLSchemaFactory).create([StudentCommerceResolver, AdminCommerceResolver]);
            const queries = schema.getQueryType()?.getFields();
            const mutations = schema.getMutationType()?.getFields();
            expect(queries?.myCourseLearningContent).toBeDefined();
            expect(queries?.myCommerceStats).toBeDefined();
            expect(queries?.adminPayments).toBeDefined();
            expect(queries?.adminCommerceWebhooks).toBeDefined();
            expect(mutations?.enrollInFreeCourse).toBeDefined();
            expect(mutations?.createCheckoutSession).toBeDefined();
            expect(mutations?.reconcileCheckout).toBeDefined();
            expect(schema.getType('CommercePayment')?.toString()).toBe('CommercePayment');
        } finally {
            await module.close();
        }
    });
});
