import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CouponsService } from './coupons.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

@ApiTags('Coupons')
@Controller('coupons')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post('validate')
  @ApiOperation({ summary: 'Validate coupon code' })
  @ApiResponse({ status: 200, description: 'Coupon validated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid coupon or validation failed' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  async validateCoupon(
    @Request() req: any,
    @Body() validateCouponDto: ValidateCouponDto,
  ) {
    const tenantId = req.user.tenantId;
    return this.couponsService.validateCoupon(tenantId, validateCouponDto);
  }

  @Post('create-default')
  @ApiOperation({ summary: 'Create default coupon code "5" with value 5 based on the tenant\'s default currency' })
  @ApiResponse({ status: 200, description: 'Default coupon created successfully' })
  async createDefaultCoupon(@Request() req: any) {
    const tenantId = req.user.tenantId;
    await this.couponsService.createDefaultCoupon(tenantId);
    return { message: 'Default coupon created successfully', code: '5', value: 5 };
  }
}

