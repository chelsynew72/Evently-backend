import { IsIn, IsEmail, IsString, Length, IsNotEmpty } from 'class-validator';
import { UserRole } from '@prisma/client';

// Deliberately NOT the full UserRole enum — ADMIN must never be
// self-assignable through the public signup flow. Admins are created via
// a direct database update (see README).
const SELF_ASSIGNABLE_ROLES = [UserRole.ATTENDEE, UserRole.CREATOR] as const;

export class VerifyEmailCodeDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @IsString()
  @Length(6, 6, { message: 'Email code must be exactly 6 digits' })
  code: string;

  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsNotEmpty()
  @IsString()
  country: string;

  // Only meaningful on first-ever verification (account creation); ignored
  // for existing users, whose role was already set at signup.
  @IsIn(SELF_ASSIGNABLE_ROLES)
  userRole: typeof SELF_ASSIGNABLE_ROLES[number];
}