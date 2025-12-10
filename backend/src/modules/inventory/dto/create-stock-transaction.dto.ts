import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, IsNumber, IsOptional } from 'class-validator';

export class CreateStockTransactionDto {
  @ApiProperty()
  @IsUUID()
  ingredientId: string;

  @ApiProperty()
  @IsString()
  transactionType: string; // purchase, usage, adjustment, transfer_in, transfer_out, waste

  @ApiProperty()
  @IsNumber()
  quantity: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  unitCost?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  reason?: string;
}

