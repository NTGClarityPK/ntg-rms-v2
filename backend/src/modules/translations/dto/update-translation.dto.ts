import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsUUID, IsBoolean, IsIn } from 'class-validator';
import { EntityType, FieldName } from './create-translation.dto';

export class UpdateTranslationDto {
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

  @ApiProperty()
  @IsString()
  translatedText: string;

  @ApiProperty({ required: false, description: 'Mark as manually edited (false if AI-generated)' })
  @IsBoolean()
  @IsOptional()
  isAiGenerated?: boolean;
}

