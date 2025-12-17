import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsNumber, IsBoolean, IsArray } from 'class-validator';

export class FoodItemVariationDto {
  @ApiProperty()
  @IsString()
  variationGroup: string;

  @ApiProperty()
  @IsString()
  variationName: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  priceAdjustment?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  stockQuantity?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  displayOrder?: number;
}

export class FoodItemDiscountDto {
  @ApiProperty()
  @IsString()
  discountType: string; // percentage, fixed

  @ApiProperty()
  @IsNumber()
  discountValue: number;

  @ApiProperty()
  @IsString()
  startDate: string;

  @ApiProperty()
  @IsString()
  endDate: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class UpdateFoodItemDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  basePrice?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  stockType?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  stockQuantity?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  menuType?: string; // Legacy field, kept for backward compatibility

  @ApiProperty({ required: false, type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  menuTypes?: string[]; // Array of menu types the item belongs to

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  ageLimit?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  displayOrder?: number;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ required: false, type: [FoodItemVariationDto] })
  @IsArray()
  @IsOptional()
  variations?: FoodItemVariationDto[];

  @ApiProperty({ required: false, type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  labels?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  addOnGroupIds?: string[];

  @ApiProperty({ required: false, type: [FoodItemDiscountDto] })
  @IsArray()
  @IsOptional()
  discounts?: FoodItemDiscountDto[];
}


