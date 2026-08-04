import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { verifyQrToken } from '../common/utils/qr-token.util';

@Injectable()
export class CheckinService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async scan(qrToken: string, scannerId: string) {
    const secret = this.configService.get<string>('qrSigningSecret')!;
    const { valid, ticketId } = verifyQrToken(qrToken, secret);

    if (!valid || !ticketId) {
      throw new BadRequestException('This QR code is invalid or has been tampered with');
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { ticketTier: { include: { event: true } } },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    // Only the event's creator (or staff, once that concept exists) can
    // check attendees in — prevents one creator scanning another's event.
    if (ticket.ticketTier.event.creatorId !== scannerId) {
      throw new ForbiddenException('You are not authorized to check in attendees for this event');
    }

    if (ticket.status === TicketStatus.USED) {
      throw new BadRequestException(
        `This ticket was already checked in at ${ticket.checkedInAt?.toISOString()}`,
      );
    }
    if (ticket.status !== TicketStatus.VALID) {
      throw new BadRequestException(`This ticket is ${ticket.status.toLowerCase()} and cannot be used`);
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: TicketStatus.USED, checkedInAt: new Date(), checkedInById: scannerId },
    });

    return {
      message: 'Checked in successfully',
      ticketId: updated.id,
      eventTitle: ticket.ticketTier.event.title,
      checkedInAt: updated.checkedInAt,
    };
  }
}
