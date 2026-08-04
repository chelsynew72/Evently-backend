import { Module } from '@nestjs/common';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { CloudinaryProvider } from './cloudinary/cloudinary.provider';
import { CloudinaryService } from './cloudinary/cloudinary.service';

@Module({
  controllers: [VerificationController],
  providers: [VerificationService, CloudinaryProvider, CloudinaryService],
})
export class VerificationModule {}
