import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateDeliveryStatusDto {
  @ApiProperty()
  @IsString()
  status: string; // pending, assigned, out_for_delivery, delivered, cancelled
}

