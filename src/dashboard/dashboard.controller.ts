import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CREATOR)
@Controller('creator/dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get()
  getSummary(@CurrentUser('id') creatorId: string) {
    return this.dashboardService.getSummary(creatorId);
  }

  @Get('events/:eventId')
  async getEventStats(@Param('eventId') eventId: string, @CurrentUser('id') creatorId: string) {
    const stats = await this.dashboardService.getEventStats(eventId, creatorId);
    if (!stats) throw new NotFoundException('Event not found or you do not own it');
    return stats;
  }
}
