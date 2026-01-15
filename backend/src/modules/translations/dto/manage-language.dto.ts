import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreateLanguageDto {
  @ApiProperty({ example: 'es', description: 'ISO 639-1 language code' })
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  code: string;

  @ApiProperty({ example: 'Spanish', description: 'English name of the language' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Español', description: 'Native name of the language' })
  @IsString()
  nativeName: string;

  @ApiProperty({ example: false, description: 'Is right-to-left language', required: false })
  @IsOptional()
  @IsBoolean()
  rtl?: boolean;

  @ApiProperty({ example: false, description: 'Set as default language', required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateLanguageDto {
  @ApiProperty({ example: 'Spanish', description: 'English name of the language', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'Español', description: 'Native name of the language', required: false })
  @IsOptional()
  @IsString()
  nativeName?: string;

  @ApiProperty({ example: false, description: 'Is right-to-left language', required: false })
  @IsOptional()
  @IsBoolean()
  rtl?: boolean;

  @ApiProperty({ example: true, description: 'Is active', required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: false, description: 'Set as default language', required: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class RetranslateDto {
  @ApiProperty({ enum: ['ingredient', 'category', 'food_item', 'addon', 'variation', 'addon_group', 'variation_group', 'buffet', 'combo_meal', 'branch', 'customer', 'employee', 'tax', 'restaurant', 'menu', 'invoice'] })
  entityType: string;

  @ApiProperty({ example: 'uuid', description: 'Entity ID' })
  @IsString()
  entityId: string;

  @ApiProperty({ example: ['ar', 'ku', 'fr'], description: 'Target languages to re-translate', required: false })
  @IsOptional()
  targetLanguages?: string[];
}






