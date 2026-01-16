import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class GetCustomersDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search customers by name or phone' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Minimum number of orders', type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minOrders?: number;

  @ApiPropertyOptional({ description: 'Minimum total spent', type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minSpent?: number;

  @ApiPropertyOptional({ description: 'Language code for translations', example: 'en' })
  @IsOptional()
  @IsString()
  language?: string;
}







