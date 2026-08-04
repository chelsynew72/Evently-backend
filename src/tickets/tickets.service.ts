import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TicketsService {
  constructor(private prisma: PrismaService) {}

  findMine(userId: string) {
    return this.prisma.ticket.findMany({
      where: { userId },
      include: {
        ticketTier: { include: { event: true } },
      },
      orderBy: { purchasedAt: 'desc' },
    });
  }

  async findById(id: string, userId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: { ticketTier: { include: { event: true } } },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.userId !== userId) throw new ForbiddenException('This ticket does not belong to you');
    return ticket;
  }
}
