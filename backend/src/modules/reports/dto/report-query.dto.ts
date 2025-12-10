import { IsOptional, IsString, IsEnum, IsDateString, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum GroupByPeriod {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

export enum ExportFormat {
  CSV = 'csv',
  EXCEL = 'excel',
}

export class ReportQueryDto {
  @ApiPropertyOptional({ description: 'Start date (ISO format)', example: '2025-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO format)', example: '2025-01-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Branch ID to filter by' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ enum: GroupByPeriod, default: GroupByPeriod.DAY })
  @IsOptional()
  @IsEnum(GroupByPeriod)
  groupBy?: GroupByPeriod;

  @ApiPropertyOptional({ description: 'Export format', enum: ExportFormat })
  @IsOptional()
  @IsEnum(ExportFormat)
  export?: ExportFormat;
}

export class TopItemsQueryDto extends ReportQueryDto {
  @ApiPropertyOptional({ description: 'Limit number of items', default: 10, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}

