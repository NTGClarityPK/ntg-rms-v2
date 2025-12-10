import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsDateString } from 'class-validator';

export class AssignDeliveryDto {
  @ApiProperty()
  @IsUUID()
  orderId: string;

  @ApiProperty()
  @IsUUID()
  deliveryPersonId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  estimatedDeliveryTime?: string;
}

