import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsBoolean, IsOptional, IsEnum, Min, Max } from 'class-validator';

export enum TaxAppliesTo {
  ORDER = 'order',
  CATEGORY = 'category',
  ITEM = 'item',
}

export class CreateTaxDto {
  @ApiProperty({ description: 'Tax name', example: 'VAT' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Tax code/reference', example: 'VAT001', required: false })
  @IsString()
  @IsOptional()
  taxCode?: string;

  @ApiProperty({ description: 'Tax rate as percentage', example: 15, minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  rate: number;

  @ApiProperty({ description: 'Whether tax is active', default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ 
    description: 'What the tax applies to', 
    enum: TaxAppliesTo, 
    default: TaxAppliesTo.ORDER 
  })
  @IsEnum(TaxAppliesTo)
  @IsOptional()
  appliesTo?: TaxAppliesTo;

  @ApiProperty({ description: 'Apply tax on delivery charges', default: false })
  @IsBoolean()
  @IsOptional()
  appliesToDelivery?: boolean;

  @ApiProperty({ description: 'Apply tax on service charges', default: false })
  @IsBoolean()
  @IsOptional()
  appliesToServiceCharge?: boolean;

  @ApiProperty({ description: 'Category IDs to apply tax to (if appliesTo is category)', required: false, type: [String] })
  @IsString({ each: true })
  @IsOptional()
  categoryIds?: string[];

  @ApiProperty({ description: 'Food item IDs to apply tax to (if appliesTo is item)', required: false, type: [String] })
  @IsString({ each: true })
  @IsOptional()
  foodItemIds?: string[];
}

