import { BadRequestException, Controller, Headers, Post, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';
import { StripeService } from './stripe/stripe.service';
import { OrdersService } from './orders.service';

/**
 * Stripe webhooks must be verified against the *raw* request body, not the
 * JSON-parsed one — the signature is computed over the exact bytes Stripe
 * sent. main.ts enables `rawBody: true` on the Nest app so `req.rawBody`
 * is available here even though every other route gets normal parsed JSON.
 */
@Controller('webhooks/stripe')
export class StripeWebhookController {
  constructor(
    private stripeService: StripeService,
    private ordersService: OrdersService,
  ) {}

  @Post()
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!req.rawBody || !signature) {
      throw new BadRequestException('Missing Stripe signature or raw body');
    }

    const event = this.stripeService.constructWebhookEvent(req.rawBody, signature);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object as { id: string };
        await this.ordersService.handlePaymentSucceeded(intent.id);
        break;
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object as { id: string };
        await this.ordersService.handlePaymentFailed(intent.id);
        break;
      }
      default:
        break; // ignore event types we don't act on
    }

    return { received: true };
  }
}
