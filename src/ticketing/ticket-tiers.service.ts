import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketTierDto } from './dto/create-ticket-tier.dto';

@Injectable()
export class TicketTiersService {
  constructor(private prisma: PrismaService) {}

  async create(eventId: string, creatorId: string, dto: CreateTicketTierDto) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.creatorId !== creatorId) throw new ForbiddenException('You do not own this event');

    return this.prisma.ticketTier.create({
      data: {
        eventId,
        name: dto.name,
        price: dto.price,
        currency: dto.currency ?? 'usd',
        quantityTotal: dto.quantityTotal,
        quantityRemaining: dto.quantityTotal,
        salesStart: dto.salesStart ? new Date(dto.salesStart) : undefined,
        salesEnd: dto.salesEnd ? new Date(dto.salesEnd) : undefined,
      },
    });
  }

  findByEvent(eventId: string) {
    return this.prisma.ticketTier.findMany({ where: { eventId } });
  }
}
