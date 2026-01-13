import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, IsOptional, IsBoolean, IsNumber, IsDateString, IsArray, IsUUID, ArrayMinSize } from 'class-validator';

export class CreateEmployeeDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ type: [String], description: 'Array of role IDs to assign to the employee' })
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds: string[];

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  employeeId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  photoUrl?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  nationalId?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  employmentType?: string; // full_time, part_time, contract

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  joiningDate?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  salary?: number;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ type: [String], description: 'Array of branch IDs to assign to the employee (required)' })
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1, { message: 'At least one branch must be assigned' })
  branchIds: string[];

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  createAuthAccount?: boolean;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  password?: string;
}
