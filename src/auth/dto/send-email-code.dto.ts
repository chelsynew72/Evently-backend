import { IsEmail } from 'class-validator';

export class SendEmailCodeDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;
}