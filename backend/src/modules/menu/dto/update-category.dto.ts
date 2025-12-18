import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsBoolean, IsNumber } from 'class-validator';

export class UpdateCategoryDto {
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
  parentId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  categoryType?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  displayOrder?: number;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}


