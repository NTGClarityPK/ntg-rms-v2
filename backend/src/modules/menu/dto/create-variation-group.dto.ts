import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateVariationGroupDto {
  @ApiProperty()
  @IsString()
  name: string;
}



