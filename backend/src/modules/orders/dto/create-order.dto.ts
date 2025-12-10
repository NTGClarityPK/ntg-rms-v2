import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  ValidateNested,
  IsNumber,
  IsEnum,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemAddOnDto {
  @ApiProperty()
  @IsUUID()
  addOnId: string;

  @ApiProperty({ required: false, default: 1 })
  @IsNumber()
  @Min(1)
  @IsOptional()
  quantity?: number;
}

export class OrderItemDto {
  @ApiProperty()
  @IsUUID()
  foodItemId: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  variationId?: string;

  @ApiProperty({ type: [OrderItemAddOnDto], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemAddOnDto)
  @IsOptional()
  addOns?: OrderItemAddOnDto[];

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  specialInstructions?: string;
}

export class CreateOrderDto {
  @ApiProperty()
  @IsUUID()
  branchId: string;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  counterId?: string;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  tableId?: string;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @ApiProperty({ enum: ['dine_in', 'takeaway', 'delivery'] })
  @IsEnum(['dine_in', 'takeaway', 'delivery'])
  orderType: 'dine_in' | 'takeaway' | 'delivery';

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  tokenNumber?: string;

  @ApiProperty({ required: false, default: 0 })
  @IsNumber()
  @IsOptional()
  extraDiscountAmount?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  couponCode?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  specialInstructions?: string;

  @ApiProperty({ enum: ['pay_first', 'pay_after'], default: 'pay_first' })
  @IsEnum(['pay_first', 'pay_after'])
  @IsOptional()
  paymentTiming?: 'pay_first' | 'pay_after';

  @ApiProperty({ enum: ['cash', 'card'], required: false })
  @IsEnum(['cash', 'card'])
  @IsOptional()
  paymentMethod?: 'cash' | 'card';

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  customerAddressId?: string; // For delivery orders

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  deliveryAddressEn?: string; // For walk-in delivery customers

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  deliveryAddressAr?: string; // For walk-in delivery customers

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  deliveryAddressCity?: string; // For walk-in delivery customers

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  deliveryAddressState?: string; // For walk-in delivery customers

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  deliveryAddressCountry?: string; // For walk-in delivery customers

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  numberOfPersons?: number; // For dine-in orders
}

