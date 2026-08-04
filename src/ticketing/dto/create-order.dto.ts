import { IsInt, IsString, IsUUID, Min } from 'class-validator';

export class CreateOrderDto {
  @IsUUID()
  eventId: string;

  @IsUUID()
  ticketTierId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}
