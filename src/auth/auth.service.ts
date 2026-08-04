import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { compareOtp, generateOtp, hashOtp } from '../common/utils/otp.util';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

const OTP_EXPIRY_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async sendOtp({ phoneNumber }: SendOtpDto) {
    const code = generateOtp();
    const codeHash = await hashOtp(code);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await this.prisma.otpCode.create({
      data: { phoneNumber, codeHash, expiresAt },
    });

    // No real SMS provider wired up yet (keeping this free-tier for now).
    // Swap this line for a Twilio/Vonage call later — everything else in
    // the OTP flow stays the same.
    // eslint-disable-next-line no-console
    console.log(`[DEV ONLY] OTP for ${phoneNumber}: ${code}`);

    return { message: 'OTP sent successfully' };
  }

  async verifyOtp({ phoneNumber, otp, userRole }: VerifyOtpDto) {
    const otpRecord = await this.prisma.otpCode.findFirst({
      where: { phoneNumber },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException('No OTP was requested for this phone number');
    }
    if (otpRecord.expiresAt < new Date()) {
      throw new BadRequestException('OTP has expired, please request a new one');
    }
    if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
      throw new BadRequestException('Too many incorrect attempts, please request a new OTP');
    }

    const isValid = await compareOtp(otp, otpRecord.codeHash);
    if (!isValid) {
      await this.prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Incorrect OTP');
    }

    // OTP is single-use — consume it now that it's verified.
    await this.prisma.otpCode.delete({ where: { id: otpRecord.id } });

    let user = await this.prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { phoneNumber, role: userRole },
      });
    }

    const tokens = await this.issueTokens(user.id, user.role);
    return { user, ...tokens };
  }

  async refreshTokens(refreshToken: string) {
    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const storedTokens = await this.prisma.refreshToken.findMany({
      where: { userId: payload.sub, revoked: false, expiresAt: { gt: new Date() } },
    });

    // Refresh tokens are stored hashed, so we compare against each
    // candidate rather than looking one up directly by value.
    let matchedTokenId: string | null = null;
    for (const stored of storedTokens) {
      if (await bcrypt.compare(refreshToken, stored.tokenHash)) {
        matchedTokenId = stored.id;
        break;
      }
    }
    if (!matchedTokenId) {
      throw new UnauthorizedException('Refresh token not recognized or already used');
    }

    // Rotate: revoke the used token and issue a brand new pair. This limits
    // the blast radius if a refresh token is ever stolen.
    await this.prisma.refreshToken.update({
      where: { id: matchedTokenId },
      data: { revoked: true },
    });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
    return this.issueTokens(user.id, user.role);
  }

  async logout(userId: string, refreshToken: string) {
    const storedTokens = await this.prisma.refreshToken.findMany({
      where: { userId, revoked: false },
    });
    for (const stored of storedTokens) {
      if (await bcrypt.compare(refreshToken, stored.tokenHash)) {
        await this.prisma.refreshToken.update({
          where: { id: stored.id },
          data: { revoked: true },
        });
        break;
      }
    }
    return { message: 'Logged out successfully' };
  }

  private async issueTokens(userId: string, role: string) {
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, role },
      {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get<string>('jwt.accessExpiry'),
      },
    );

    const refreshToken = await this.jwtService.signAsync(
      { sub: userId },
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiry'),
      },
    );

    const tokenHash = await bcrypt.hash(refreshToken, 10);
    const expiryDays = parseInt(
      (this.configService.get<string>('jwt.refreshExpiry') ?? '30d').replace('d', ''),
      10,
    );
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken };
  }
}
