import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CheckinService } from './checkin.service';
import { ScanTicketDto } from './dto/scan-ticket.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CREATOR)
@Controller('checkin')
export class CheckinController {
  constructor(private checkinService: CheckinService) {}

  @Post('scan')
  scan(@Body() dto: ScanTicketDto, @CurrentUser('id') scannerId: string) {
    return this.checkinService.scan(dto.qrToken, scannerId);
  }
}
