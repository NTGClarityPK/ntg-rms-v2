import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, IsOptional, IsBoolean, IsDateString, Matches } from 'class-validator';

export class UpdateTenantDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  nameEn?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  nameAr?: string;

  @ApiProperty({ required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  logoUrl?: string;

  @ApiProperty({ required: false, description: 'Hex color code (e.g., #FF5733)' })
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'primaryColor must be a valid hex color code' })
  @IsOptional()
  primaryColor?: string;

  // Currency cannot be changed after registration - removed from update DTO
  // @ApiProperty({ required: false, description: 'Default currency code (e.g., IQD, USD)' })
  // @IsString()
  // @IsOptional()
  // defaultCurrency?: string;

  @ApiProperty({ required: false, description: 'Timezone (e.g., Asia/Baghdad)' })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiProperty({ required: false, description: 'Fiscal year start date (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  fiscalYearStart?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  vatNumber?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

