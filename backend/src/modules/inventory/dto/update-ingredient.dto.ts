import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, IsDecimal } from 'class-validator';

export class UpdateIngredientDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  nameEn?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  nameAr?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  unitOfMeasurement?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  currentStock?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  minimumThreshold?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  costPerUnit?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  storageLocation?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

