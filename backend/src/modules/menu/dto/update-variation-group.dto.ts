import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateVariationGroupDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;
}






