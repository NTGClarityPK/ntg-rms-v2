import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, IsDateString, IsIn, Min } from 'class-validator';

export class CreateCouponDto {
  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty({ enum: ['fixed', 'percentage'] })
  @IsIn(['fixed', 'percentage'])
  discountType: 'fixed' | 'percentage';

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  discountValue: number;

  @ApiProperty({ required: false, default: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  minOrderAmount?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  @Min(0)
  maxDiscountAmount?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  @Min(1)
  usageLimit?: number;

  @ApiProperty({ required: false, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  validFrom?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  validUntil?: string;
}



