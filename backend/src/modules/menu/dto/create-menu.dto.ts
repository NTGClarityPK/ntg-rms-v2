import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsUUID, IsBoolean } from 'class-validator';

export class CreateMenuDto {
  @ApiProperty()
  @IsString()
  nameEn: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  nameAr?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  descriptionEn?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  descriptionAr?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  foodItemIds?: string[];

  @ApiProperty({ required: false, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}


