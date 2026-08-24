import { IsEmail, IsString, Length, IsNotEmpty, IsIn } from 'class-validator';
import { UserRole } from '@prisma/client';

const SELF_ASSIGNABLE_ROLES = [UserRole.ATTENDEE, UserRole.CREATOR] as const;

export class SignupDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @IsString()
  @Length(8, 100, { message: 'Password must be at least 8 characters long' })
  password: string;

  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsNotEmpty()
  @IsString()
  country: string;

  @IsIn(SELF_ASSIGNABLE_ROLES)
  userRole: typeof SELF_ASSIGNABLE_ROLES[number];
}