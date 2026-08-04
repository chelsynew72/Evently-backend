import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { NearbyQueryDto } from './dto/nearby-query.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('events')
export class EventsController {
  constructor(private eventsService: EventsService) {}

  // --- Public discovery routes (no auth required — browsing events
  // shouldn't be gated behind login) ---

  @Get('nearby')
  findNearby(@Query() query: NearbyQueryDto) {
    return this.eventsService.findNearby(query);
  }

  @Get('search')
  search(@Query() query: SearchQueryDto) {
    return this.eventsService.search(query);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.eventsService.findById(id);
  }

  // --- Creator-only routes ---

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @Post()
  create(@CurrentUser('id') creatorId: string, @Body() dto: CreateEventDto) {
    return this.eventsService.create(creatorId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @Get('mine/list')
  findMine(@CurrentUser('id') creatorId: string) {
    return this.eventsService.findByCreator(creatorId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser('id') creatorId: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(id, creatorId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @Patch(':id/publish')
  publish(@Param('id') id: string, @CurrentUser('id') creatorId: string) {
    return this.eventsService.publish(id, creatorId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CREATOR)
  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser('id') creatorId: string) {
    return this.eventsService.cancel(id, creatorId);
  }
}
