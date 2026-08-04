import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { VerificationService } from './verification.service';
import { RejectVerificationDto } from './dto/reject-verification.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('verification')
export class VerificationController {
  constructor(private verificationService: VerificationService) {}

  @Roles(UserRole.CREATOR)
  @Post('submit')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'idCard', maxCount: 1 },
        { name: 'selfie', maxCount: 1 },
      ],
      { limits: { fileSize: MAX_FILE_SIZE_BYTES } },
    ),
  )
  submit(
    @CurrentUser('id') userId: string,
    @UploadedFiles()
    files: { idCard?: Express.Multer.File[]; selfie?: Express.Multer.File[] },
  ) {
    const idCard = files.idCard?.[0];
    const selfie = files.selfie?.[0];

    if (!idCard || !selfie) {
      throw new BadRequestException('Both an ID card image and a selfie are required');
    }
    for (const file of [idCard, selfie]) {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        throw new BadRequestException('Only JPEG and PNG images are accepted');
      }
    }

    return this.verificationService.submit(userId, idCard.buffer, selfie.buffer);
  }

  @Roles(UserRole.CREATOR)
  @Get('status')
  getStatus(@CurrentUser('id') userId: string) {
    return this.verificationService.getStatus(userId);
  }

  // --- Reviewer endpoints — ADMIN only ---
  // There's no signup path that creates an ADMIN user yet (by design —
  // see the README's "Creating your first admin" section: it's done via
  // a direct database update, not through the public API).

  @Roles(UserRole.ADMIN)
  @Get('pending')
  listPending() {
    return this.verificationService.listPending();
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/approve')
  approve(@Param('id') id: string, @CurrentUser('id') reviewerId: string) {
    return this.verificationService.approve(id, reviewerId);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/reject')
  reject(
    @Param('id') id: string,
    @CurrentUser('id') reviewerId: string,
    @Body() dto: RejectVerificationDto,
  ) {
    return this.verificationService.reject(id, reviewerId, dto.reason);
  }
}
