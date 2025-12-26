import { IsString, IsNumber, IsOptional, IsArray, Min, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBuffetDto {
  @ApiProperty({ description: 'Buffet name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Buffet description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Image URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ description: 'Price per person' })
  @IsNumber()
  @Min(0.01)
  pricePerPerson: number;

  @ApiPropertyOptional({ description: 'Minimum number of persons (optional)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  minPersons?: number;

  @ApiPropertyOptional({ description: 'Duration in minutes (optional)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  duration?: number;

  @ApiProperty({ description: 'Menu types array', type: [String] })
  @IsArray()
  @IsString({ each: true })
  menuTypes: string[];

  @ApiPropertyOptional({ description: 'Display order' })
  @IsOptional()
  @IsNumber()
  displayOrder?: number;

  @ApiPropertyOptional({ description: 'Is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}



