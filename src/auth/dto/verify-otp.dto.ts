import { IsIn, IsPhoneNumber, IsString, Length } from 'class-validator';
import { UserRole } from '@prisma/client';

// Deliberately NOT the full UserRole enum — ADMIN must never be
// self-assignable through the public signup flow. Admins are created via
// a direct database update (see README).
const SELF_ASSIGNABLE_ROLES = [UserRole.ATTENDEE, UserRole.CREATOR] as const;

export class VerifyOtpDto {
  @IsPhoneNumber(undefined, { message: 'Please provide a valid phone number in E.164 format' })
  phoneNumber: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp: string;

  // Only meaningful on first-ever verification (account creation); ignored
  // for existing users, whose role was already set at signup.
  @IsIn(SELF_ASSIGNABLE_ROLES)
  userRole: typeof SELF_ASSIGNABLE_ROLES[number];
}
