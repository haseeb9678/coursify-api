import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service.js';
import { CheckoutService } from './checkout.service.js';
import { CommerceReadService } from './commerce-read.service.js';
import { CommerceStore } from './commerce.store.js';
import { EnrollmentService } from './enrollment.service.js';
import { PaymentFulfillmentService } from './payment-fulfillment.service.js';
import { paymentScope } from './payment-policy.js';
import { StripeWebhookService } from './stripe-webhook.service.js';
import { StripeProvider, type ProviderIntent, type ProviderMoneyDetails, type ProviderSession } from './stripe.provider.js';

const testDatabase = process.env.COMMERCE_TEST_DATABASE_URL;
const localDatabase = testDatabase && /^postgres(?:ql)?:\/\/[^@/]+@(?:localhost|127\.0\.0\.1):\d+\/coursify_commerce_test$/.test(testDatabase);
const secret = 'whsec_commerce_fixture';
const stripeSdk = new Stripe('sk_test_fixture');
const eventBody = (id: string, type: string, sessionId: string) => {
    const payload = JSON.stringify({ id, type, livemode: false, data: { object: { id: sessionId, object: 'checkout.session' } } });
    return { raw: Buffer.from(payload), signature: stripeSdk.webhooks.generateTestHeaderString({ payload, secret }) };
};

describe.runIf(!!localDatabase)('enrollment and payment against a disposable PostgreSQL database', () => {
    let prisma: PrismaService;
    let provider: StripeProvider;
    let checkout: CheckoutService;
    let fulfillment: PaymentFulfillmentService;
    let enrollment: EnrollmentService;
    let read: CommerceReadService;
    let webhooks: StripeWebhookService;
    let instructorId: string;
    let categoryId: string;
    let studentId: string;
    let otherStudentId: string;
    const sessions = new Map<string, ProviderSession>();
    const intents = new Map<string, ProviderIntent>();
    const details = new Map<string, ProviderMoneyDetails>();

    beforeAll(async () => {
        if (!testDatabase || !localDatabase) throw Error('A disposable loopback commerce database is required.');
        prisma = new PrismaService(new ConfigService({ database: { url: testDatabase } }));
        const category = await prisma.category.create({ data: {
            slug: `commerce-${randomUUID()}`, name: 'Testing', description: 'Commerce integration category',
            iconName: 'Code2', iconColor: '#2563EB', iconBackground: '#DBEAFE',
        } });
        categoryId = category.id;
        instructorId = (await createUser('INSTRUCTOR')).id;
        otherStudentId = (await createUser('STUDENT')).id;
    }, 15_000);

    beforeEach(async () => {
        vi.restoreAllMocks();
        studentId = (await createUser('STUDENT')).id;
        const config = new ConfigService({
            app: { frontendUrl: 'http://localhost:3000' }, PAYMENTS_ENABLED: 'true',
            STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: secret,
            STRIPE_PKR_MIN_MINOR_UNITS: '15000',
        });
        const store = new CommerceStore(prisma);
        provider = new StripeProvider(config);
        fulfillment = new PaymentFulfillmentService(store, provider);
        checkout = new CheckoutService(store, provider, fulfillment, config);
        enrollment = new EnrollmentService(store);
        read = new CommerceReadService(store);
        webhooks = new StripeWebhookService(store, provider, fulfillment);

        vi.spyOn(provider, 'createSession').mockImplementation(async (attempt) => {
            const id = `cs_test_${attempt.id.replaceAll('-', '')}`;
            const existing = sessions.get(id);
            if (existing) return existing;
            const session: ProviderSession = {
                id, client_reference_id: attempt.orderId, mode: 'payment', livemode: false,
                metadata: { scope: paymentScope, paymentId: attempt.id, orderId: attempt.orderId },
                amount_total: attempt.amountMinorUnits, currency: attempt.currency.toLowerCase(),
                status: 'open', payment_status: 'unpaid', payment_intent: null,
                url: `https://checkout.stripe.com/c/pay/${id}`,
            };
            sessions.set(id, session);
            return session;
        });
        vi.spyOn(provider, 'retrieveSession').mockImplementation(async (id) => {
            const session = sessions.get(id);
            if (!session) throw Error('Missing fixture session');
            return { ...session };
        });
        vi.spyOn(provider, 'recoverSession').mockImplementation(async (attempt) =>
            [...sessions.values()].find((item) => item.metadata?.paymentId === attempt.id) ?? null);
        vi.spyOn(provider, 'retrieveIntent').mockImplementation(async (id) => {
            const intent = intents.get(id);
            if (!intent) throw Error('Missing fixture intent');
            return { ...intent };
        });
        vi.spyOn(provider, 'moneyDetails').mockImplementation(async (id) => details.get(id) ?? { refunds: [], disputes: [] });
    }, 10_000);

    afterAll(async () => { if (prisma) await prisma.$disconnect(); });

    function createUser(role: 'STUDENT' | 'INSTRUCTOR' | 'ADMIN', status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') {
        return prisma.user.create({ data: {
            email: `${randomUUID()}@commerce.example.test`, name: 'Commerce fixture', passwordHash: 'unused-local-test', role, status,
        } });
    }

    function createCourse(pricingType: 'FREE' | 'PAID', status: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED') {
        return prisma.course.create({ data: {
            slug: `commerce-${randomUUID()}`, title: 'Commerce fixture course', status, pricingType, currency: 'PKR',
            priceMinorUnits: pricingType === 'PAID' ? 499900 : 0,
            discountedPriceMinorUnits: pricingType === 'PAID' ? 399900 : null,
            categoryId, instructorId, createdById: instructorId,
            sections: { create: { title: 'Section', position: 1, lessons: { create: {
                title: 'Private lesson', type: 'TEXT', position: 1, content: 'Protected fixture text',
                resources: { create: { title: 'Private resource', type: 'LINK', url: 'https://example.test/resource', position: 1 } },
            } } } },
        } });
    }

    async function start(courseId: string) {
        return checkout.start(studentId, courseId, { currency: 'PKR', amountMinorUnits: 399900 });
    }

    async function session(orderId: string) {
        const attempt = await prisma.payment.findFirstOrThrow({ where: { orderId } });
        const fixture = [...sessions.values()].find((item) => item.metadata?.paymentId === attempt.id);
        if (!fixture) throw Error('Fixture session not created');
        return fixture;
    }

    function markPaid(session: ProviderSession) {
        const id = `pi_${session.id}`;
        session.status = 'complete';
        session.payment_status = 'paid';
        session.payment_intent = id;
        const intent: ProviderIntent = {
            id, livemode: false, amount: session.amount_total ?? 0, amount_received: session.amount_total ?? 0,
            currency: session.currency ?? 'pkr', metadata: session.metadata ?? {}, status: 'succeeded', last_payment_error: null,
            latest_charge: {
                id: `ch_${session.id}`, livemode: false, status: 'succeeded', paid: true, captured: true,
                amount_captured: session.amount_total ?? 0, currency: session.currency ?? 'pkr',
                created: Math.floor(Date.now() / 1000), payment_intent: id, payment_method_details: { type: 'card' },
                receipt_url: 'https://pay.stripe.com/receipts/payment/verified-fixture',
            },
        };
        intents.set(id, intent);
        return id;
    }

    async function deliver(session: ProviderSession, kind = 'checkout.session.completed', id = `evt_${randomUUID()}`) {
        const { raw, signature } = eventBody(id, kind, session.id);
        await webhooks.handle(raw, signature);
        return id;
    }

    it('creates one concurrent free enrollment and restricts learning to the enrolled student', async () => {
        const course = await createCourse('FREE');
        const results = await Promise.all([enrollment.enrollFree(studentId, course.id), enrollment.enrollFree(studentId, course.id)]);
        expect(results[0].id).toBe(results[1].id);
        expect(results[0].source).toBe('FREE');
        expect(await prisma.purchaseOrder.count({ where: { courseId: course.id } })).toBe(0);
        expect(await prisma.enrollment.count({ where: { courseId: course.id } })).toBe(1);
        const learning = await enrollment.learningContent(studentId, course.id);
        expect(learning.sections[0].lessons[0].resources[0].title).toBe('Private resource');
        await expect(enrollment.learningContent(otherStudentId, course.id)).rejects.toThrow(/active enrollment/);
        await prisma.course.update({ where: { id: course.id }, data: { status: 'ARCHIVED' } });
        await expect(enrollment.learningContent(studentId, course.id)).resolves.toMatchObject({ id: course.id });
        await prisma.course.update({ where: { id: course.id }, data: { status: 'DRAFT' } });
        await expect(enrollment.learningContent(studentId, course.id)).rejects.toThrow(/available course/);
    }, 15_000);

    it('stores comments per lesson and shares them only with students who can access the lesson', async () => {
        const [course, otherCourse, visitor] = await Promise.all([
            createCourse('FREE'), createCourse('FREE'), createUser('STUDENT'),
        ]);
        await enrollment.enrollFree(studentId, course.id);
        await enrollment.enrollFree(visitor.id, otherCourse.id);
        const lessonId = (await enrollment.learningContent(studentId, course.id)).sections[0].lessons[0].id;
        const otherLessonId = (await enrollment.learningContent(visitor.id, otherCourse.id)).sections[0].lessons[0].id;
        const pagination = { page: 1, limit: 1 };

        await expect(enrollment.lessonComments(visitor.id, course.id, lessonId, pagination)).rejects.toThrow(/requires access/);
        await expect(enrollment.postLessonComment(visitor.id, otherCourse.id, lessonId, 'Wrong lesson')).rejects.toThrow(/requires access/);
        await expect(enrollment.postLessonComment(studentId, course.id, lessonId, '  ')).rejects.toThrow(/1 and 2,000/);
        await expect(enrollment.postLessonComment(studentId, course.id, lessonId, 'a'.repeat(2001))).rejects.toThrow(/1 and 2,000/);
        const first = await enrollment.postLessonComment(studentId, course.id, lessonId, '  First question  ');
        await prisma.lessonComment.update({ where: { id: first.id }, data: { createdAt: new Date('2026-01-01T00:00:00Z') } });
        const second = await enrollment.postLessonComment(studentId, course.id, lessonId, 'Second question');
        expect(first).toMatchObject({ body: 'First question', author: { name: 'Commerce fixture' } });
        expect(first.author).not.toHaveProperty('email');

        await enrollment.enrollFree(visitor.id, course.id);
        await expect(enrollment.lessonComments(visitor.id, course.id, lessonId, pagination)).resolves.toMatchObject({
            items: [{ id: second.id }], meta: { total: 2, hasNext: true },
        });
        await expect(enrollment.lessonComments(visitor.id, course.id, lessonId, { ...pagination, page: 2 })).resolves.toMatchObject({
            items: [{ id: first.id }], meta: { hasNext: false },
        });
        await expect(enrollment.lessonComments(visitor.id, otherCourse.id, otherLessonId, pagination)).resolves.toMatchObject({ items: [] });
        await prisma.enrollment.update({ where: { userId_courseId: { userId: visitor.id, courseId: course.id } }, data: { status: 'REVOKED' } });
        await expect(enrollment.lessonComments(visitor.id, course.id, lessonId, pagination)).rejects.toThrow(/requires access/);
        await expect(enrollment.postLessonComment(visitor.id, course.id, lessonId, 'Cannot write')).rejects.toThrow(/requires access/);
    }, 15_000);

    it('rejects inactive users, non-students, paid courses, and unpublished courses for free enrollment', async () => {
        const [free, draft, paid, inactive] = await Promise.all([
            createCourse('FREE'), createCourse('FREE', 'DRAFT'), createCourse('PAID'), createUser('STUDENT', 'INACTIVE'),
        ]);
        await expect(enrollment.enrollFree(inactive.id, free.id)).rejects.toThrow(/active student/);
        await expect(enrollment.enrollFree(instructorId, free.id)).rejects.toThrow(/active student/);
        await expect(enrollment.enrollFree(studentId, paid.id)).rejects.toThrow(/not eligible/);
        await expect(enrollment.enrollFree(studentId, draft.id)).rejects.toThrow(/unavailable/);
    }, 15_000);

    it('preserves a checkout across provider timeouts and database persistence errors', async () => {
        const course = await createCourse('PAID');
        const originalCreate = vi.mocked(provider.createSession).getMockImplementation();
        if (!originalCreate) throw Error('Missing Stripe fixture');
        vi.mocked(provider.createSession).mockImplementationOnce(async (attempt, title) => {
            await originalCreate(attempt, title);
            throw new ServiceUnavailableException('Simulated lost Stripe response');
        });
        await expect(start(course.id)).rejects.toThrow(/lost Stripe response/);
        const storeSession = vi.spyOn(fulfillment, 'fromSession').mockRejectedValueOnce(new Error('Simulated database failure'));
        await expect(start(course.id)).rejects.toThrow(/database failure/);
        const result = await start(course.id);
        storeSession.mockRestore();
        expect(result.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);
        const keys = vi.mocked(provider.createSession).mock.calls.slice(0, 3).map(([attempt]) => attempt.idempotencyKey);
        expect(new Set(keys).size).toBe(1);
        expect(await prisma.purchaseOrder.count({ where: { userId: studentId, courseId: course.id } })).toBe(1);
        expect(await prisma.payment.count({ where: { orderId: result.orderId } })).toBe(1);
        await expect(checkout.status(otherStudentId, result.orderId)).rejects.toThrow(/Order not found/);
        await expect(read.order(result.orderId, otherStudentId)).rejects.toThrow(/Order not found/);
        const [resolved, resumed] = await Promise.allSettled([start(course.id), start(course.id)]);
        expect([resolved, resumed].filter((call) => call.status === 'fulfilled').length).toBeGreaterThan(0);
        expect(await prisma.payment.count({ where: { orderId: result.orderId } })).toBe(1);
    }, 15_000);

    it('fulfills only confirmed payments, retries failed webhooks and ignores late expiration', async () => {
        const course = await createCourse('PAID');
        const result = await start(course.id);
        const stripeSession = await session(result.orderId);
        expect(await checkout.status(studentId, result.orderId)).toMatchObject({ status: 'PENDING', canResume: true, canAccess: false });
        await deliver(stripeSession);
        expect(await prisma.enrollment.count({ where: { courseId: course.id } })).toBe(0);

        markPaid(stripeSession);
        const failedId = `evt_failed_${randomUUID()}`;
        vi.mocked(provider.retrieveIntent).mockRejectedValueOnce(new Error('Provider temporarily unavailable'));
        await expect(deliver(stripeSession, 'checkout.session.completed', failedId)).rejects.toThrow(/retried/);
        expect(await prisma.webhookEvent.findUnique({ where: { stripeEventId: failedId } })).toMatchObject({ status: 'FAILED', attempts: 1 });
        await Promise.allSettled([
            deliver(stripeSession, 'checkout.session.completed', failedId),
            deliver(stripeSession, 'checkout.session.completed', failedId),
        ]);
        await deliver(stripeSession, 'checkout.session.completed', failedId);
        expect(await prisma.webhookEvent.findUnique({ where: { stripeEventId: failedId } })).toMatchObject({ status: 'PROCESSED', attempts: 2 });
        await deliver(stripeSession, 'checkout.session.expired');
        expect(await checkout.status(studentId, result.orderId)).toMatchObject({ status: 'PAID', paymentStatus: 'SUCCEEDED', canAccess: true });
        expect(await prisma.enrollment.count({ where: { courseId: course.id } })).toBe(1);
        await expect(start(course.id)).rejects.toThrow(/already have access/);
    }, 15_000);

    it('rejects amount and currency mismatches before writing paid state or enrollment', async () => {
        const course = await createCourse('PAID');
        const result = await start(course.id);
        const stripeSession = await session(result.orderId);
        markPaid(stripeSession);
        stripeSession.amount_total = 1;
        await expect(deliver(stripeSession)).rejects.toThrow(/retried/);
        stripeSession.amount_total = 399900;
        stripeSession.currency = 'usd';
        await expect(deliver(stripeSession)).rejects.toThrow(/retried/);
        expect(await checkout.status(studentId, result.orderId)).toMatchObject({ status: 'PENDING', canAccess: false });
    }, 15_000);

    it('preserves partial refunds, excludes failed refunds, and revokes only on full refund', async () => {
        const course = await createCourse('PAID');
        const result = await start(course.id);
        const stripeSession = await session(result.orderId);
        const intentId = markPaid(stripeSession);
        await deliver(stripeSession);
        const created = Math.floor(Date.now() / 1000);
        const refund = { id: `re_partial_${randomUUID()}`, amount: 100000, currency: 'pkr', status: 'succeeded', reason: null, created, payment_intent: intentId, charge: null };
        const remaining = { ...refund, id: `re_remaining_${randomUUID()}`, amount: 299900, status: 'failed' };
        details.set(intentId, { refunds: [refund, remaining], disputes: [] });
        await deliver(stripeSession);
        expect(await checkout.status(studentId, result.orderId)).toMatchObject({ status: 'PARTIALLY_REFUNDED', canAccess: true });
        remaining.status = 'succeeded';
        await deliver(stripeSession);
        expect(await checkout.status(studentId, result.orderId)).toMatchObject({ status: 'REFUNDED', canAccess: false, enrollmentStatus: 'REVOKED' });
        expect(await read.payment((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: result.orderId } })).successfulPaymentId ?? '')).toMatchObject({
            refundedMinorUnits: 399900,
            receiptUrl: 'https://pay.stripe.com/receipts/payment/verified-fixture',
        });
    }, 15_000);

    it('flags duplicate successful purchases and preserves access through an alternative paid order', async () => {
        const course = await createCourse('PAID');
        const first = await start(course.id);
        const firstSession = await session(first.orderId);
        firstSession.status = 'expired';
        firstSession.url = null;
        await deliver(firstSession, 'checkout.session.expired');
        expect(await checkout.status(studentId, first.orderId)).toMatchObject({ status: 'EXPIRED' });

        const second = await start(course.id);
        expect(second.orderId).not.toBe(first.orderId);
        const secondSession = await session(second.orderId);
        const secondIntent = markPaid(secondSession);
        await deliver(secondSession);
        markPaid(firstSession);
        await deliver(firstSession);
        expect(await checkout.status(studentId, first.orderId)).toMatchObject({ status: 'PAID', requiresReview: true });
        expect(await prisma.purchaseOrder.count({ where: { courseId: course.id, paidAt: { not: null } } })).toBe(2);
        expect(await prisma.enrollment.count({ where: { courseId: course.id } })).toBe(1);

        details.set(secondIntent, { refunds: [{
            id: `re_full_${randomUUID()}`, amount: 399900, currency: 'pkr', status: 'succeeded', reason: null,
            created: Math.floor(Date.now() / 1000), payment_intent: secondIntent, charge: null,
        }], disputes: [] });
        await deliver(secondSession);
        expect(await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: studentId, courseId: course.id } } }))
            .toMatchObject({ status: 'ACTIVE', orderId: first.orderId });
    }, 15_000);

    it('records disputes, flags open disputes and reconciles a loss without automatic reactivation', async () => {
        const course = await createCourse('PAID');
        const result = await start(course.id);
        const stripeSession = await session(result.orderId);
        const intentId = markPaid(stripeSession);
        await deliver(stripeSession);
        const dispute = {
            id: `dp_test_${randomUUID()}`, payment_intent: intentId, charge: 'ch_fixture',
            currency: 'pkr', amount: 399900, status: 'needs_response' as const,
            reason: 'fraudulent', livemode: false, created: Math.floor(Date.now() / 1000),
        };
        details.set(intentId, { refunds: [], disputes: [dispute] });
        await deliver(stripeSession);
        expect(await checkout.status(studentId, result.orderId)).toMatchObject({ requiresReview: true, canAccess: true });

        details.set(intentId, { refunds: [], disputes: [{ ...dispute, status: 'lost' }] });
        await deliver(stripeSession);
        expect(await checkout.status(studentId, result.orderId)).toMatchObject({ status: 'PAID', canAccess: false, enrollmentStatus: 'REVOKED' });
        expect(await prisma.paymentDispute.count({ where: { stripeDisputeId: dispute.id } })).toBe(1);

        details.set(intentId, { refunds: [], disputes: [{ ...dispute, status: 'won' }] });
        await deliver(stripeSession);
        expect(await checkout.status(studentId, result.orderId)).toMatchObject({ canAccess: false, enrollmentStatus: 'REVOKED' });
    }, 15_000);


    it('returns owned student metadata, order actions and totals across pages', async () => {
        const [free, paid, pending, otherFree, otherPaid] = await Promise.all([
            createCourse('FREE'), createCourse('PAID'), createCourse('PAID'),
            createCourse('FREE'), createCourse('PAID'),
        ]);
        const freeEnrollment = await enrollment.enrollFree(studentId, free.id);
        await prisma.courseLesson.updateMany({
            where: { section: { courseId: free.id } },
            data: { durationSeconds: 125 },
        });
        await enrollment.enrollFree(otherStudentId, otherFree.id);
        await checkout.start(otherStudentId, otherPaid.id, { currency: 'PKR', amountMinorUnits: 399900 });

        const paidOrder = await start(paid.id);
        const providerSession = await session(paidOrder.orderId);
        markPaid(providerSession);
        await deliver(providerSession);
        const pendingOrder = await start(pending.id);

        const metadata = await read.enrollment(freeEnrollment.id, studentId);
        expect(metadata.course).toMatchObject({ sectionCount: 1, lessonCount: 1, durationSeconds: 125 });
        const page = await read.enrollments({ page: 1, limit: 1 }, { categoryId }, studentId);
        expect(page.items).toHaveLength(1);
        expect(page.meta.total).toBe(2);
        expect((await read.enrollments({ page: 1, limit: 10 }, { categoryId: randomUUID() }, studentId)).items).toEqual([]);

        const stats = await read.studentStats(studentId);
        expect(stats.enrollments).toMatchObject({ total: 2, active: 2, free: 1, paid: 1 });
        expect(stats.categories.map(({ id }) => id)).toEqual([categoryId]);
        expect(stats.orders).toEqual([{
            currency: 'PKR', isTestMode: true, total: 2, paid: 1, pending: 1, totalPaidMinorUnits: '399900',
        }]);
        expect(stats.payments.counts).toEqual([{ isTestMode: true, successful: 1, pending: 1, failed: 0 }]);
        expect(stats.payments.totals).toMatchObject([{ currency: 'PKR', grossMinorUnits: '399900', refundedMinorUnits: '0' }]);
        expect(await read.order(pendingOrder.orderId, studentId)).toMatchObject({
            status: 'PENDING', canResume: true, course: { publiclyAvailable: true },
        });
        expect(await read.order(paidOrder.orderId, studentId)).toMatchObject({
            status: 'PAID', canResume: false, enrollment: { status: 'ACTIVE' },
        });
        await expect(read.enrollment(freeEnrollment.id, otherStudentId)).rejects.toThrow('Enrollment not found');
        await expect(read.order(paidOrder.orderId, otherStudentId)).rejects.toThrow('Order not found');
        const attempts = await read.payments({ page: 1, limit: 10 }, { status: 'SUCCEEDED' }, studentId);
        expect(attempts.items).toHaveLength(1);
        await expect(read.payment(attempts.items[0].id, otherStudentId)).rejects.toThrow('Payment not found');
        expect((await read.studentStats(otherStudentId)).payments.counts)
            .toEqual([{ isTestMode: true, successful: 0, pending: 1, failed: 0 }]);
    }, 15_000);

});
