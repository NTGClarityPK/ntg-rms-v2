import { IsString, IsNumber, IsOptional, IsArray, Min, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateComboMealDto {
  @ApiProperty({ description: 'Combo meal name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Combo meal description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Image URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ description: 'Base price for the combo meal' })
  @IsNumber()
  @Min(0.01)
  basePrice: number;

  @ApiProperty({ description: 'Food item IDs included in combo', type: [String] })
  @IsArray()
  @IsString({ each: true })
  foodItemIds: string[];

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

  @ApiPropertyOptional({ description: 'Is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
