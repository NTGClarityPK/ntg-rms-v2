import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min } from 'class-validator';

export class UpdateVariationDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false, description: 'Recipe multiplier (e.g., 1.25 for large size)' })
  @IsNumber()
  @IsOptional()
  @Min(0.01)
  recipeMultiplier?: number;

  @ApiProperty({ required: false, description: 'Pricing adjustment for this variation' })
  @IsNumber()
  @IsOptional()
  pricingAdjustment?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  displayOrder?: number;
}



