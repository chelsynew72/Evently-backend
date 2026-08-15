import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from './cloudinary/cloudinary.service';

@Injectable()
export class VerificationService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async submit(userId: string, idCardBuffer: Buffer, selfieBuffer: Buffer) {
    const existing = await this.prisma.creatorVerification.findUnique({ where: { userId } });
    if (existing && existing.status !== VerificationStatus.REJECTED) {
      throw new ConflictException(
        'A verification request is already pending or approved for this account',
      );
    }

    const [idCardUpload, selfieUpload] = await Promise.all([
      this.cloudinary.uploadBuffer(idCardBuffer, 'evently/id-cards'),
      this.cloudinary.uploadBuffer(selfieBuffer, 'evently/selfies'),
    ]);

    const data = {
      idCardImageUrl: idCardUpload.public_id,
      selfieImageUrl: selfieUpload.public_id,
      status: VerificationStatus.PENDING,
      rejectionReason: null,
      reviewedBy: null,
      reviewedAt: null,
      submittedAt: new Date(),
    };

    if (existing) {
      return this.prisma.creatorVerification.update({ where: { userId }, data });
    }
    return this.prisma.creatorVerification.create({ data: { userId, ...data } });
  }

  async getStatus(userId: string) {
    const record = await this.prisma.creatorVerification.findUnique({ where: { userId } });
    if (!record) return { status: 'NOT_SUBMITTED' };
    return {
      status: record.status,
      rejectionReason: record.rejectionReason,
      submittedAt: record.submittedAt,
      reviewedAt: record.reviewedAt,
    };
  }

  // --- Admin/reviewer actions ---
  // No dedicated admin role in the schema yet — for now any authenticated
  // request to these routes must go through a manual gate (e.g. a
  // separate internal tool or a shared reviewer secret). Revisit once an
  // ADMIN role is added to the User model.

  async listPending() {
    return this.prisma.creatorVerification.findMany({
      where: { status: VerificationStatus.PENDING },
      include: { user: { select: { id: true, email: true, fullName: true } } },
      orderBy: { submittedAt: 'asc' },
    });
  }

  async approve(verificationId: string, reviewerId: string) {
    const record = await this.findOrThrow(verificationId);
    if (record.status !== VerificationStatus.PENDING) {
      throw new BadRequestException('Only pending verifications can be approved');
    }
    return this.prisma.creatorVerification.update({
      where: { id: verificationId },
      data: { status: VerificationStatus.APPROVED, reviewedBy: reviewerId, reviewedAt: new Date() },
    });
  }

  async reject(verificationId: string, reviewerId: string, reason: string) {
    const record = await this.findOrThrow(verificationId);
    if (record.status !== VerificationStatus.PENDING) {
      throw new BadRequestException('Only pending verifications can be rejected');
    }
    return this.prisma.creatorVerification.update({
      where: { id: verificationId },
      data: {
        status: VerificationStatus.REJECTED,
        rejectionReason: reason,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      },
    });
  }

  private async findOrThrow(id: string) {
    const record = await this.prisma.creatorVerification.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Verification request not found');
    return record;
  }
}