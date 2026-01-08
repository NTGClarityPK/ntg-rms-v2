import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsUUID, IsIn } from 'class-validator';
import { EntityType, FieldName } from './create-translation.dto';

export class GetTranslationDto {
  @ApiProperty({ enum: EntityType })
  @IsString()
  @IsIn(Object.values(EntityType))
  entityType: EntityType | string;

  @ApiProperty()
  @IsUUID()
  entityId: string;

  @ApiProperty()
  @IsString()
  languageCode: string;

  @ApiProperty({ enum: FieldName })
  @IsString()
  @IsIn(Object.values(FieldName))
  fieldName: FieldName | string;

  @ApiProperty({ required: false, description: 'Fallback language if translation not found (default: en)' })
  @IsString()
  @IsOptional()
  fallbackLanguage?: string;
}

