import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsOptional, IsUUID } from 'class-validator';

export class SignupDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  nameEn: string;

  @ApiProperty({ example: 'جون دو', required: false })
  @IsString()
  @IsOptional()
  nameAr?: string;

  @ApiProperty({ example: '+9647501234567', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'tenant_owner', required: false })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiProperty({ example: 'IQD', required: false })
  @IsString()
  @IsOptional()
  defaultCurrency?: string;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  tenantId?: string;
}

