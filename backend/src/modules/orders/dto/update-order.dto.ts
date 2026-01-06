import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  ValidateNested,
  IsNumber,
  IsEnum,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderItemDto } from './create-order.dto';

export class UpdateOrderDto {
  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  tableId?: string;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @ApiProperty({ enum: ['dine_in', 'takeaway', 'delivery'], required: false })
  @IsEnum(['dine_in', 'takeaway', 'delivery'])
  @IsOptional()
  orderType?: 'dine_in' | 'takeaway' | 'delivery';

  @ApiProperty({ type: [OrderItemDto], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  @IsOptional()
  items?: OrderItemDto[];

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

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  customerAddressId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  deliveryAddress?: string; // For walk-in delivery customers

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
 // For walk-in delivery customers

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
  numberOfPersons?: number;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  branchId?: string;
}

