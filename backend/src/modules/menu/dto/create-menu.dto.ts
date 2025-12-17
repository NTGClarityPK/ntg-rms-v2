import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsUUID, IsBoolean, Matches } from 'class-validator';

export class CreateMenuDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[a-z0-9_]+$/, { message: 'Menu type must contain only lowercase letters, numbers, and underscores' })
  menuType: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

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


