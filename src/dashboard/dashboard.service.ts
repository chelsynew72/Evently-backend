import { Injectable } from '@nestjs/common';
import { EventStatus, OrderStatus, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// Creators check this far more often than they publish/sell, and expect
// fresher numbers than public discovery pages — short TTL, still enough
// to absorb a dashboard being left open and polling/refreshing.
const DASHBOARD_CACHE_TTL_SECONDS = 30;

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getSummary(creatorId: string) {
    const cacheKey = `dashboard:summary:${creatorId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

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

    const summary = {
      totalEvents: events,
      totalRevenue: revenueResult._sum.totalAmount ?? 0,
      totalTicketsSold: ticketsSold,
      upcomingEvents,
    };
    await this.redis.set(cacheKey, summary, DASHBOARD_CACHE_TTL_SECONDS);
    return summary;
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
