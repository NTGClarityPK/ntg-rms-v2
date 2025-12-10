import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';

export enum TableStatus {
  AVAILABLE = 'available',
  OCCUPIED = 'occupied',
  RESERVED = 'reserved',
  OUT_OF_SERVICE = 'out_of_service',
}

export enum TableType {
  REGULAR = 'regular',
  VIP = 'vip',
  OUTDOOR = 'outdoor',
}

export class UpdateTableDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  tableNumber?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  seatingCapacity?: number;

  @ApiProperty({ required: false, enum: TableType })
  @IsEnum(TableType)
  @IsOptional()
  tableType?: TableType;

  @ApiProperty({ required: false, enum: TableStatus })
  @IsEnum(TableStatus)
  @IsOptional()
  status?: TableStatus;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  qrCode?: string;
}

