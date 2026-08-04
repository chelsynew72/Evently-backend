import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateTicketTierDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsString()
  currency?: string = 'usd';

  @IsInt()
  @Min(1)
  quantityTotal: number;

  @IsOptional()
  @IsDateString()
  salesStart?: string;

  @IsOptional()
  @IsDateString()
  salesEnd?: string;
}
