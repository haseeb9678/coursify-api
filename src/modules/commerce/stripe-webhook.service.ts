import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type Stripe from 'stripe';

import { CommerceStore } from './commerce.store.js';
import { PaymentFulfillmentService, type EventClaim } from './payment-fulfillment.service.js';
import { paymentScope } from './payment-policy.js';
import { StripeProvider } from './stripe.provider.js';

@Injectable()
export class StripeWebhookService {
    private readonly logger = new Logger(StripeWebhookService.name);

    constructor(
        private readonly store: CommerceStore,
        private readonly stripe: StripeProvider,
        private readonly fulfillment: PaymentFulfillmentService,
    ) {}

    async handle(raw: Buffer | undefined, signature: string | undefined) {
        const event = this.stripe.verifyEvent(raw, signature);
        const claim = await this.claim(event);
        if (!claim) return;

        try {
            const reference = await this.stripe.eventReference(event);
            const session = reference && ('sessionId' in reference
                ? await this.stripe.retrieveSession(reference.sessionId)
                : await this.sessionForIntent(reference.intentId));
            const handled = session && await this.fulfillment.fromSession(session, claim, undefined, event.type);
            if (!handled) {
                await this.store.transaction((tx) => this.fulfillment.finishEvent(tx, claim, 'IGNORED'));
            }
        } catch (error) {
            const code = error instanceof BadRequestException ? 'PROVIDER_DATA_MISMATCH' : 'RECONCILIATION_RETRY_REQUIRED';
            await this.store.prisma.webhookEvent.updateMany({
                where: { stripeEventId: claim.stripeEventId, status: 'PROCESSING', leaseToken: claim.token },
                data: { status: 'FAILED', lastError: code, leaseToken: null, leaseUntil: null },
            });
            this.logger.warn(`${code} (${event.id})`);
            throw new ServiceUnavailableException('Webhook processing will be retried.');
        }
    }

    private async claim(event: Stripe.Event): Promise<EventClaim | null> {
        const timestamp = new Date();
        const token = randomUUID();
        const stripeEventId = event.id;
        const object = event.data.object;
        const stripeObjectId = 'id' in object && typeof object.id === 'string' ? object.id : null;
        return this.store.transaction(async (tx) => {
            const previous = await tx.webhookEvent.upsert({
                where: { stripeEventId },
                create: { stripeEventId, eventType: event.type, stripeObjectId, isTestMode: true },
                update: {},
            });
            if (previous.status === 'PROCESSED' || previous.status === 'IGNORED') return null;

            const updated = await tx.webhookEvent.updateMany({
                where: {
                    stripeEventId,
                    OR: [
                        { status: { in: ['PENDING', 'FAILED'] } },
                        { status: 'PROCESSING', leaseUntil: { lte: timestamp } },
                    ],
                },
                data: { status: 'PROCESSING', attempts: { increment: 1 }, leaseToken: token, leaseUntil: new Date(timestamp.getTime() + 120_000) },
            });
            if (updated.count !== 1) throw new ServiceUnavailableException('Webhook processing is in progress.');
            return { stripeEventId, token };
        });
    }

    private async sessionForIntent(id: string) {
        const intent = await this.stripe.retrieveIntent(id);
        if (intent.metadata.scope !== paymentScope) return null;
        const session = await this.stripe.sessionForIntent(id);
        if (!session) throw new ServiceUnavailableException('The Stripe checkout link is not available yet.');
        return session;
    }
}
