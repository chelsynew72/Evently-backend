import { IsString, MinLength } from 'class-validator';

export class RejectVerificationDto {
  @IsString()
  @MinLength(10, { message: 'Please provide a specific reason so the creator knows what to fix' })
  reason: string;
}
