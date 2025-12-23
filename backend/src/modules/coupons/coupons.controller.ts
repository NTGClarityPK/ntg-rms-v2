import { Controller, Post, Body, UseGuards, Request, Get, Put, Delete, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CouponsService } from './coupons.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

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

  @Get()
  @ApiOperation({ summary: 'Get all coupons' })
  @ApiResponse({ status: 200, description: 'Coupons retrieved successfully' })
  async getCoupons(
    @CurrentUser() user: any,
    @Query() paginationDto?: PaginationDto,
  ) {
    return this.couponsService.getCoupons(user.tenantId, paginationDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get coupon by ID' })
  @ApiResponse({ status: 200, description: 'Coupon retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  async getCouponById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.couponsService.getCouponById(user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new coupon' })
  @ApiResponse({ status: 201, description: 'Coupon created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 409, description: 'Coupon code already exists' })
  async createCoupon(@CurrentUser() user: any, @Body() createDto: CreateCouponDto) {
    return this.couponsService.createCoupon(user.tenantId, createDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update coupon' })
  @ApiResponse({ status: 200, description: 'Coupon updated successfully' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  @ApiResponse({ status: 409, description: 'Coupon code already exists' })
  async updateCoupon(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateCouponDto,
  ) {
    return this.couponsService.updateCoupon(user.tenantId, id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete coupon (soft delete)' })
  @ApiResponse({ status: 200, description: 'Coupon deleted successfully' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  async deleteCoupon(@CurrentUser() user: any, @Param('id') id: string) {
    return this.couponsService.deleteCoupon(user.tenantId, id);
  }
}

