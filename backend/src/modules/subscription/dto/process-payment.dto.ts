import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, Matches, IsOptional } from 'class-validator';
import { PlanId } from './create-subscription.dto';

export class ProcessPaymentDto {
  @ApiProperty({ enum: PlanId })
  @IsEnum(PlanId)
  @IsNotEmpty()
  planId: PlanId;

  @ApiProperty({ example: '4242424242424242' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{13,19}$/, { message: 'Card number must be 13-19 digits' })
  cardNumber: string;

  @ApiProperty({ example: '12/25' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(0[1-9]|1[0-2])\/\d{2}$/, { message: 'Expiry must be in MM/YY format' })
  expiry: string;

  @ApiProperty({ example: '123' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{3,4}$/, { message: 'CVV must be 3-4 digits' })
  cvv: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  cardholderName: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  billingAddress?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  billingCity?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  billingCountry?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  billingPostalCode?: string;
}


