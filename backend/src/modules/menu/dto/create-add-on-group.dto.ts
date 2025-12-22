import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsNumber, IsIn } from 'class-validator';

export class CreateAddOnGroupDto {
  @ApiProperty()
  @IsString()
  name: string;

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

  @ApiProperty({ 
    required: false,
    enum: ['Add', 'Remove', 'Change'],
    description: 'Category type: Add, Remove, or Change'
  })
  @IsString()
  @IsOptional()
  @IsIn(['Add', 'Remove', 'Change'], { message: 'Category must be one of: Add, Remove, Change' })
  category?: 'Add' | 'Remove' | 'Change';
}

