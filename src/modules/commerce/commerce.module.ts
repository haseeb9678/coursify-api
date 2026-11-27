import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../../common/authorization.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CheckoutService } from './checkout.service.js';
import { CommerceOriginGuard } from './commerce-origin.guard.js';
import { CommerceReadService } from './commerce-read.service.js';
import { AdminCommerceResolver, StudentCommerceResolver } from './commerce.resolvers.js';
import { CommerceStore } from './commerce.store.js';
import { EnrollmentService } from './enrollment.service.js';
import { PaymentFulfillmentService } from './payment-fulfillment.service.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';
import { StripeWebhookService } from './stripe-webhook.service.js';
import { StripeProvider } from './stripe.provider.js';

@Module({
    imports: [AuthorizationModule, AuthModule],
    controllers: [StripeWebhookController],
    providers: [
        CommerceStore, CommerceOriginGuard, StripeProvider, CheckoutService, PaymentFulfillmentService,
        StripeWebhookService, EnrollmentService, CommerceReadService, AdminCommerceResolver, StudentCommerceResolver,
    ],
})
export class CommerceModule {}
