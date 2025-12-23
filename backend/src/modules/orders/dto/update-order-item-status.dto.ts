import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum } from 'class-validator';

export class UpdateOrderItemStatusDto {
  @ApiProperty({
    enum: ['pending', 'preparing', 'ready'],
    description: 'Status of the order item',
  })
  @IsEnum(['pending', 'preparing', 'ready'])
  status: 'pending' | 'preparing' | 'ready';
}


