import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { TicketTiersService } from './ticket-tiers.service';
import { CreateTicketTierDto } from './dto/create-ticket-tier.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('events/:eventId/ticket-tiers')
export class TicketTiersController {
  constructor(private ticketTiersService: TicketTiersService) {}

  @Get()
  findByEvent(@Param('eventId') eventId: string) {
    return this.ticketTiersService.findByEvent(eventId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @Post()
  create(
    @Param('eventId') eventId: string,
    @CurrentUser('id') creatorId: string,
    @Body() dto: CreateTicketTierDto,
  ) {
    return this.ticketTiersService.create(eventId, creatorId, dto);
  }
}
