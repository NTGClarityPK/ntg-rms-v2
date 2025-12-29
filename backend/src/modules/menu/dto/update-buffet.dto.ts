import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsArray, Min, IsBoolean } from 'class-validator';

export class UpdateBuffetDto {
  @ApiPropertyOptional({ description: 'Buffet name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Buffet description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Image URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Price per person' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  pricePerPerson?: number;

  @ApiPropertyOptional({ description: 'Minimum number of persons' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  minPersons?: number;

  @ApiPropertyOptional({ description: 'Duration in minutes' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  duration?: number;

  @ApiPropertyOptional({ description: 'Menu types array', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  menuTypes?: string[];

  @ApiPropertyOptional({ description: 'Display order' })
  @IsOptional()
  @IsNumber()
  displayOrder?: number;

  @ApiPropertyOptional({ description: 'Is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}




