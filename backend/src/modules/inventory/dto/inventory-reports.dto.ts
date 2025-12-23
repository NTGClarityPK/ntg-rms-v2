import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsDateString, IsUUID, IsBoolean, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class InventoryReportsQueryDto extends PaginationDto {
  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  ingredientId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  lowStockOnly?: boolean;
}

