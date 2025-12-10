import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsUUID, IsNumber, Min, Max } from 'class-validator';

export class CreateBranchDto {
  @ApiProperty()
  @IsString()
  nameEn: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  nameAr?: string;

  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  addressEn?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  addressAr?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty({ required: false, default: 'Iraq' })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ required: false, description: 'Latitude for location' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  latitude?: number;

  @ApiProperty({ required: false, description: 'Longitude for location' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  longitude?: number;

  @ApiProperty({ required: false, description: 'Manager user ID' })
  @IsUUID()
  @IsOptional()
  managerId?: string;
}

