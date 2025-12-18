import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsNumber, Min } from 'class-validator';

export enum PaymentStatus {
  UNPAID = 'unpaid',
  PAID = 'paid',
}

export class UpdatePaymentStatusDto {
  @ApiProperty({ enum: PaymentStatus })
  @IsEnum(PaymentStatus)
  paymentStatus: PaymentStatus;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  amountPaid?: number;

  @ApiProperty({ enum: ['cash', 'card'], required: false })
  @IsEnum(['cash', 'card'])
  @IsOptional()
  paymentMethod?: 'cash' | 'card';
}

