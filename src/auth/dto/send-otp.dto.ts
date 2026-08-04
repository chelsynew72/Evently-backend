import { IsPhoneNumber } from 'class-validator';

export class SendOtpDto {
  @IsPhoneNumber(undefined, { message: 'Please provide a valid phone number in E.164 format, e.g. +15551234567' })
  phoneNumber: string;
}
