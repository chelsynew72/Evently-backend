import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../email/email.service";
import { compareCode, generateCode, hashCode } from "../common/utils/code.util";
import { SendEmailCodeDto } from "./dto/send-email-code.dto";
import { VerifyEmailCodeDto } from "./dto/verify-email-code.dto";
import { SignupDto } from "./dto/signup.dto";
import { LoginDto } from "./dto/login.dto";

const EMAIL_CODE_EXPIRY_MINUTES = 5;
const MAX_EMAIL_CODE_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  async sendEmailCode({ email }: SendEmailCodeDto) {
    const code = generateCode();
    const codeHash = await hashCode(code);
    const expiresAt = new Date(
      Date.now() + EMAIL_CODE_EXPIRY_MINUTES * 60 * 1000,
    );

    await this.prisma.emailCode.create({
      data: { email, codeHash, expiresAt },
    });

    // Send real email via Gmail (falls back to console logging if not configured)
    await this.emailService.sendVerificationCode(email, code);

    return { message: "Email code sent successfully" };
  }

  async verifyEmailCode({
    email,
    code,
    userRole,
    fullName,
    country,
    password,
  }: VerifyEmailCodeDto) {
    const emailCodeRecord = await this.prisma.emailCode.findFirst({
      where: { email },
      orderBy: { createdAt: "desc" },
    });

    if (!emailCodeRecord) {
      throw new BadRequestException(
        "No email code was requested for this email address",
      );
    }
    if (emailCodeRecord.expiresAt < new Date()) {
      throw new BadRequestException(
        "Email code has expired, please request a new one",
      );
    }
    if (emailCodeRecord.attempts >= MAX_EMAIL_CODE_ATTEMPTS) {
      throw new BadRequestException(
        "Too many incorrect attempts, please request a new email code",
      );
    }

    const isValid = await compareCode(code, emailCodeRecord.codeHash);
    if (!isValid) {
      await this.prisma.emailCode.update({
        where: { id: emailCodeRecord.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException("Incorrect email code");
    }

    // Email code is single-use — consume it now that it's verified.
    await this.prisma.emailCode.delete({ where: { id: emailCodeRecord.id } });

    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      const userData: any = { email, role: userRole, fullName, country };
      
      // If password is provided, hash it and add to user data
      if (password) {
        userData.passwordHash = await bcrypt.hash(password, 10);
      }
      
      user = await this.prisma.user.create({
        data: userData,
      });
    }

    const tokens = await this.issueTokens(user.id, user.role);
    return { user, ...tokens };
  }

  async signup({ email, password, userRole, fullName, country }: SignupDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new BadRequestException("User with this email already exists");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: { email, role: userRole, fullName, country, passwordHash },
    });

    const tokens = await this.issueTokens(user.id, user.role);
    return { user, ...tokens };
  }

  async login({ email, password }: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        "Please use email OTP to login to this account",
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const tokens = await this.issueTokens(user.id, user.role);
    return { user, ...tokens };
  }

  async refreshTokens(refreshToken: string) {
    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>("jwt.refreshSecret"),
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const storedTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId: payload.sub,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
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
      throw new UnauthorizedException(
        "Refresh token not recognized or already used",
      );
    }

    // Rotate: revoke the used token and issue a brand new pair. This limits
    // the blast radius if a refresh token is ever stolen.
    await this.prisma.refreshToken.update({
      where: { id: matchedTokenId },
      data: { revoked: true },
    });

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: payload.sub },
    });
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
    return { message: "Logged out successfully" };
  }

  private async issueTokens(userId: string, role: string) {
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, role },
      {
        secret: this.configService.get<string>("jwt.accessSecret"),
        expiresIn: this.configService.get<string>("jwt.accessExpiry"),
      },
    );

    const refreshToken = await this.jwtService.signAsync(
      { sub: userId },
      {
        secret: this.configService.get<string>("jwt.refreshSecret"),
        expiresIn: this.configService.get<string>("jwt.refreshExpiry"),
      },
    );

    const tokenHash = await bcrypt.hash(refreshToken, 10);
    const expiryDays = parseInt(
      (this.configService.get<string>("jwt.refreshExpiry") ?? "30d").replace(
        "d",
        "",
      ),
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