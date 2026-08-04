import { Injectable } from '@nestjs/common';
import { EventStatus, OrderStatus, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getSummary(creatorId: string) {
    const [events, revenueResult, ticketsSold, upcomingEvents] = await Promise.all([
      this.prisma.event.count({ where: { creatorId } }),

      this.prisma.order.aggregate({
        where: { event: { creatorId }, status: OrderStatus.PAID },
        _sum: { totalAmount: true },
      }),

      this.prisma.ticket.count({
        where: { ticketTier: { event: { creatorId } }, status: { not: TicketStatus.CANCELLED } },
      }),

      this.prisma.event.findMany({
        where: { creatorId, status: EventStatus.PUBLISHED, startDateTime: { gte: new Date() } },
        orderBy: { startDateTime: 'asc' },
        take: 5,
        include: {
          _count: { select: { orders: true } },
        },
      }),
    ]);

    return {
      totalEvents: events,
      totalRevenue: revenueResult._sum.totalAmount ?? 0,
      totalTicketsSold: ticketsSold,
      upcomingEvents,
    };
  }

  async getEventStats(eventId: string, creatorId: string) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, creatorId } });
    if (!event) return null;

    const [ticketTiers, checkedInCount] = await Promise.all([
      this.prisma.ticketTier.findMany({
        where: { eventId },
        include: { _count: { select: { tickets: true } } },
      }),
      this.prisma.ticket.count({
        where: { ticketTier: { eventId }, status: TicketStatus.USED },
      }),
    ]);

    const totalSold = ticketTiers.reduce(
      (sum: number, tier: (typeof ticketTiers)[number]) => sum + tier._count.tickets,
      0,
    );
    const revenue = ticketTiers.reduce(
      (sum: number, tier: (typeof ticketTiers)[number]) => sum + tier._count.tickets * Number(tier.price),
      0,
    );

    return { event, ticketTiers, totalSold, checkedInCount, revenue };
  }
}
