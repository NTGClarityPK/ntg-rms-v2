import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsUUID, IsOptional } from 'class-validator';

export class CreateTableDto {
  @ApiProperty()
  @IsString()
  tableNumber: string;

  @ApiProperty()
  @IsUUID()
  branchId: string;

  @ApiProperty({ required: false, default: 4 })
  @IsNumber()
  @IsOptional()
  seatingCapacity?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  tableType?: string;
}

