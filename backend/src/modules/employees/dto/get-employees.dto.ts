import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class GetEmployeesDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filter by role' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ description: 'Filter by status (active/inactive)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Language code for translations', example: 'en' })
  @IsOptional()
  @IsString()
  language?: string;
}







