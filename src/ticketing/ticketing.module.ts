import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TicketTiersController } from './ticket-tiers.controller';
import { TicketTiersService } from './ticket-tiers.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeService } from './stripe/stripe.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [TicketTiersController, OrdersController, StripeWebhookController],
  providers: [TicketTiersService, OrdersService, StripeService],
})
export class TicketingModule {}
