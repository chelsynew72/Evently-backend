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
import type { Multer } from 'multer';
import { VerificationService } from './verification.service';
import { RejectVerificationDto } from './dto/reject-verification.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];

/** JPEG magic bytes: FF D8 FF. The client-supplied mimetype is spoofable,
 * so we validate the actual file content here. */
function isJpeg(buf: Buffer): boolean {
  return buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/** PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A. */
function isPng(buf: Buffer): boolean {
  return (
    buf.length > 7 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  );
}

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
      // mimetype is client-supplied and can be forged — verify magic bytes.
      if (!isJpeg(file.buffer) && !isPng(file.buffer)) {
        throw new BadRequestException('Uploaded file is not a valid JPEG or PNG image');
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
