import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsUUID, IsIn } from 'class-validator';

export enum EntityType {
  INGREDIENT = 'ingredient',
  CATEGORY = 'category',
  FOOD_ITEM = 'food_item',
  ADDON = 'addon',
  ADDON_GROUP = 'addon_group',
  VARIATION = 'variation',
  VARIATION_GROUP = 'variation_group',
  BUFFET = 'buffet',
  COMBO_MEAL = 'combo_meal',
  MENU = 'menu',
  BRANCH = 'branch',
  CUSTOMER = 'customer',
  EMPLOYEE = 'employee',
  TAX = 'tax',
  RESTAURANT = 'restaurant',
  STOCK_ADD_REASON = 'stock_add_reason',
  STOCK_DEDUCT_REASON = 'stock_deduct_reason',
  STOCK_ADJUST_REASON = 'stock_adjust_reason',
  INVOICE = 'invoice',
}

export enum FieldName {
  NAME = 'name',
  DESCRIPTION = 'description',
  TITLE = 'title',
  LABEL = 'label',
  SHORT_DESCRIPTION = 'short_description',
  LONG_DESCRIPTION = 'long_description',
  CITY = 'city',
  ADDRESS = 'address',
  NOTES = 'notes',
  COUNTRY = 'country',
  STORAGE_LOCATION = 'storage_location',
  HEADER = 'header',
  FOOTER = 'footer',
  TERMS_AND_CONDITIONS = 'terms_and_conditions',
  REASON = 'reason',
}

export class CreateTranslationDto {
  @ApiProperty({ enum: EntityType })
  @IsString()
  @IsIn(Object.values(EntityType))
  entityType: EntityType | string;

  @ApiProperty()
  @IsUUID()
  entityId: string;

  @ApiProperty({ enum: FieldName })
  @IsString()
  @IsIn(Object.values(FieldName))
  fieldName: FieldName | string;

  @ApiProperty()
  @IsString()
  text: string;

  @ApiProperty({ required: false, description: 'Source language code (auto-detected if not provided)' })
  @IsString()
  @IsOptional()
  sourceLanguage?: string;

  @ApiProperty({ required: false, description: 'Target languages (defaults to all supported)' })
  @IsString({ each: true })
  @IsOptional()
  targetLanguages?: string[];
}

