import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNumber, IsString, IsOptional, IsDateString } from 'class-validator';

export class AdjustStockDto {
  @ApiProperty()
  @IsUUID()
  ingredientId: string;

  @ApiProperty()
  @IsNumber()
  newQuantity: number; // The actual physical count

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiProperty()
  @IsString()
  reason: string; // physical_count, correction, etc.

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  transactionDate?: string;
}

