import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { EventStatus, OrderStatus, Prisma, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from './stripe/stripe.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { signQrToken } from '../common/utils/qr-token.util';
import { v4 as uuid } from 'uuid';

// Orders reserve stock immediately on creation so two buyers can't both
// "win" the last ticket. If payment is never completed, the reservation
// is released by the cron job below rather than held forever.
const PENDING_ORDER_EXPIRY_MINUTES = 15;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private stripe: StripeService,
    private configService: ConfigService,
  ) {}

  async create(userId: string, dto: CreateOrderDto) {
    const tier = await this.prisma.ticketTier.findUnique({
      where: { id: dto.ticketTierId },
      include: { event: true },
    });
    if (!tier || tier.eventId !== dto.eventId) {
      throw new NotFoundException('Ticket tier not found for this event');
    }
    if (tier.event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException('This event is not open for ticket sales');
    }
    const now = new Date();
    if (tier.salesStart && now < tier.salesStart) {
      throw new BadRequestException('Ticket sales have not started yet');
    }
    if (tier.salesEnd && now > tier.salesEnd) {
      throw new BadRequestException('Ticket sales have ended');
    }

    const totalAmount = Number(tier.price) * dto.quantity;

    // Atomic reservation: only succeeds if enough stock is still available,
    // preventing overselling under concurrent requests.
    const { order, reserved } = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updateResult = await tx.ticketTier.updateMany({
        where: { id: tier.id, quantityRemaining: { gte: dto.quantity } },
        data: { quantityRemaining: { decrement: dto.quantity } },
      });
      if (updateResult.count === 0) {
        return { order: null, reserved: false };
      }
      const createdOrder = await tx.order.create({
        data: {
          userId,
          eventId: dto.eventId,
          ticketTierId: tier.id,
          quantity: dto.quantity,
          totalAmount,
          currency: tier.currency,
          status: OrderStatus.PENDING,
        },
      });
      return { order: createdOrder, reserved: true };
    });

    if (!reserved || !order) {
      throw new ConflictException('Not enough tickets remaining in this tier');
    }

    const paymentIntent = await this.stripe.createPaymentIntent(
      Math.round(totalAmount * 100),
      tier.currency,
      { orderId: order.id, ticketTierId: tier.id, quantity: String(dto.quantity) },
    );

    await this.prisma.order.update({
      where: { id: order.id },
      data: { providerTransactionId: paymentIntent.id },
    });

    return {
      orderId: order.id,
      clientSecret: paymentIntent.client_secret,
      totalAmount,
      currency: tier.currency,
    };
  }

  /** Called from the Stripe webhook when a PaymentIntent succeeds. */
  async handlePaymentSucceeded(paymentIntentId: string) {
    const order = await this.prisma.order.findFirst({
      where: { providerTransactionId: paymentIntentId },
    });
    if (!order) {
      this.logger.warn(`Received webhook for unknown paymentIntent ${paymentIntentId}`);
      return;
    }
    if (order.status === OrderStatus.PAID) return; // idempotency guard — Stripe can retry webhooks
    if (order.status !== OrderStatus.PENDING) {
      this.logger.warn(`Ignoring payment_succeeded for order ${order.id} in status ${order.status}`);
      return;
    }

    const qrSecret = this.configService.get<string>('qrSigningSecret')!;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.PAID } });

      for (let i = 0; i < order.quantity; i++) {
        const ticketId = uuid();
        await tx.ticket.create({
          data: {
            id: ticketId,
            orderId: order.id,
            ticketTierId: order.ticketTierId,
            userId: order.userId,
            qrToken: signQrToken(ticketId, qrSecret),
            status: TicketStatus.VALID,
          },
        });
      }
    });
  }

  /** Called from the Stripe webhook when a PaymentIntent fails. */
  async handlePaymentFailed(paymentIntentId: string) {
    const order = await this.prisma.order.findFirst({
      where: { providerTransactionId: paymentIntentId },
    });
    if (!order || order.status !== OrderStatus.PENDING) return;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.FAILED } });
      await tx.ticketTier.update({
        where: { id: order.ticketTierId },
        data: { quantityRemaining: { increment: order.quantity } },
      });
    });
  }

  /**
   * Releases stock reserved by orders that never completed payment (the
   * user abandoned checkout, or Stripe never sent a webhook). Runs every
   * 5 minutes and expires anything older than PENDING_ORDER_EXPIRY_MINUTES.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async releaseExpiredReservations() {
    const cutoff = new Date(Date.now() - PENDING_ORDER_EXPIRY_MINUTES * 60 * 1000);
    const staleOrders = await this.prisma.order.findMany({
      where: { status: OrderStatus.PENDING, createdAt: { lt: cutoff } },
    });

    for (const order of staleOrders) {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Re-check status inside the transaction in case a late webhook
        // completed this order in between the query above and now.
        const current = await tx.order.findUnique({ where: { id: order.id } });
        if (!current || current.status !== OrderStatus.PENDING) return;

        await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.FAILED } });
        await tx.ticketTier.update({
          where: { id: order.ticketTierId },
          data: { quantityRemaining: { increment: order.quantity } },
        });
      });
      this.logger.log(`Expired stale pending order ${order.id}, released ${order.quantity} ticket(s)`);
    }
  }
}
