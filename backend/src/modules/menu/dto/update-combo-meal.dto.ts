import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsArray, Min, IsBoolean } from 'class-validator';

export class UpdateComboMealDto {
  @ApiPropertyOptional({ description: 'Combo meal name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Combo meal description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Image URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Base price for the combo meal' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  basePrice?: number;

  @ApiPropertyOptional({ description: 'Food item IDs included in combo', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  foodItemIds?: string[];

  @ApiPropertyOptional({ description: 'Menu types array', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  menuTypes?: string[];

  @ApiPropertyOptional({ description: 'Discount percentage' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercentage?: number;

  @ApiPropertyOptional({ description: 'Display order' })
  @IsOptional()
  @IsNumber()
  displayOrder?: number;

  @ApiPropertyOptional({ description: 'Is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}






