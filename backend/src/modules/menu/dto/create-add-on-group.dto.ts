import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';

export class CreateAddOnGroupDto {
  @ApiProperty()
  @IsString()
  nameEn: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  nameAr?: string;

  @ApiProperty({ required: false, default: 'multiple' })
  @IsString()
  @IsOptional()
  selectionType?: string;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  minSelections?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  maxSelections?: number;
}

