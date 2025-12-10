import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsObject, IsOptional } from 'class-validator';

export class SyncItemDto {
  @ApiProperty()
  @IsString()
  table: string;

  @ApiProperty()
  @IsString()
  action: string; // CREATE, UPDATE, DELETE

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  recordId?: string;

  @ApiProperty()
  @IsObject()
  data: any;
}

export class PushSyncDto {
  @ApiProperty({ type: [SyncItemDto] })
  @IsArray()
  changes: SyncItemDto[];
}

