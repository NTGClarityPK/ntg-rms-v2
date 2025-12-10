import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNumber, IsString, IsOptional, IsDateString } from 'class-validator';

export class DeductStockDto {
  @ApiProperty()
  @IsUUID()
  ingredientId: string;

  @ApiProperty()
  @IsNumber()
  quantity: number;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiProperty()
  @IsString()
  reason: string; // usage, waste, damaged, expired, etc.

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  referenceId?: string; // Can reference order_id, recipe_id, etc. - accepts any string

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  transactionDate?: string;
}

