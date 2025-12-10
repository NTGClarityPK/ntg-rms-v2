import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';

export class UpdateOrderStatusDto {
  @ApiProperty({
    enum: ['pending', 'preparing', 'ready', 'served', 'completed', 'cancelled'],
  })
  @IsEnum(['pending', 'preparing', 'ready', 'served', 'completed', 'cancelled'])
  status: 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  cancellationReason?: string;
}

