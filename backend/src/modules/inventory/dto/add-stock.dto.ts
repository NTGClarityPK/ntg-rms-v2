import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNumber, IsString, IsOptional, IsDateString } from 'class-validator';

export class AddStockDto {
  @ApiProperty()
  @IsUUID()
  ingredientId: string;

  @ApiProperty()
  @IsNumber()
  quantity: number;

  @ApiProperty()
  @IsNumber()
  unitCost: number;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  supplierName?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  invoiceNumber?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  transactionDate?: string;
}

