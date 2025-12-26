import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsNumber, Min } from 'class-validator';

export class CreateVariationDto {
  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  variationGroupId?: string; // Optional because it comes from URL parameter

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false, default: 1, description: 'Recipe multiplier (e.g., 1.25 for large size)' })
  @IsNumber()
  @IsOptional()
  @Min(0.01)
  recipeMultiplier?: number;

  @ApiProperty({ required: false, default: 0, description: 'Pricing adjustment for this variation' })
  @IsNumber()
  @IsOptional()
  pricingAdjustment?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  displayOrder?: number;
}


