import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsNumber, IsBoolean, IsArray } from 'class-validator';
import { FoodItemVariationDto, FoodItemDiscountDto } from './update-food-item.dto';

export class CreateFoodItemDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty()
  @IsUUID()
  categoryId: string;

  @ApiProperty()
  @IsNumber()
  basePrice: number;

  @ApiProperty({ required: false, default: 'unlimited' })
  @IsString()
  @IsOptional()
  stockType?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  stockQuantity?: number;

  @ApiProperty({ required: false, default: 'all_day' })
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
  @IsString()
  @IsOptional()
  imageUrl?: string;

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


