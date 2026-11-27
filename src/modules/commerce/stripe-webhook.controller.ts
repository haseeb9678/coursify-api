import { Controller, Headers, HttpCode, Post, Req, type RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { StripeWebhookService } from './stripe-webhook.service.js';

@Controller('webhooks')
export class StripeWebhookController {
    constructor(private readonly webhooks: StripeWebhookService) {}

    @Post('stripe')
    @HttpCode(200)
    async receive(@Req() request: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
        await this.webhooks.handle(request.rawBody, signature);
        return { received: true };
    }
}
