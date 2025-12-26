import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateSubscriptionDto, PlanId } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { ProcessPaymentDto } from './dto/process-payment.dto';

@ApiTags('subscription')
@Controller('subscription')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get()
  @ApiOperation({ summary: 'Get current subscription' })
  @ApiResponse({ status: 200, description: 'Subscription retrieved successfully' })
  @ApiResponse({ status: 404, description: 'No subscription found' })
  async getSubscription(@CurrentUser() user: any) {
    return this.subscriptionService.getSubscription(user.tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create subscription (trial)' })
  @ApiResponse({ status: 201, description: 'Subscription created successfully' })
  @ApiResponse({ status: 400, description: 'Subscription already exists' })
  async createSubscription(
    @CurrentUser() user: any,
    @Body() createDto: CreateSubscriptionDto,
  ) {
    return this.subscriptionService.createTrialSubscription(user.tenantId, createDto.planId);
  }

  @Put('upgrade')
  @ApiOperation({ summary: 'Upgrade subscription plan' })
  @ApiResponse({ status: 200, description: 'Subscription upgraded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid upgrade request' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async upgradePlan(
    @CurrentUser() user: any,
    @Body() body: { planId: PlanId },
  ) {
    return this.subscriptionService.upgradePlan(user.tenantId, body.planId);
  }

  @Put('downgrade')
  @ApiOperation({ summary: 'Downgrade subscription plan' })
  @ApiResponse({ status: 200, description: 'Subscription downgraded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid downgrade request' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async downgradePlan(
    @CurrentUser() user: any,
    @Body() body: { planId: PlanId },
  ) {
    return this.subscriptionService.downgradePlan(user.tenantId, body.planId);
  }

  @Delete()
  @ApiOperation({ summary: 'Cancel subscription' })
  @ApiResponse({ status: 200, description: 'Subscription cancelled successfully' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async cancelSubscription(@CurrentUser() user: any) {
    return this.subscriptionService.cancelSubscription(user.tenantId);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get subscription usage metrics' })
  @ApiResponse({ status: 200, description: 'Usage metrics retrieved successfully' })
  async getUsage(@CurrentUser() user: any) {
    return this.subscriptionService.getUsage(user.tenantId);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'Get billing history (invoices)' })
  @ApiResponse({ status: 200, description: 'Invoices retrieved successfully' })
  async getInvoices(@CurrentUser() user: any) {
    return this.subscriptionService.getInvoices(user.tenantId);
  }

  @Post('payment')
  @ApiOperation({ summary: 'Process payment (dummy payment system)' })
  @ApiResponse({ status: 200, description: 'Payment processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid payment data' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async processPayment(
    @CurrentUser() user: any,
    @Body() paymentDto: ProcessPaymentDto,
  ) {
    return this.subscriptionService.processPayment(user.tenantId, paymentDto);
  }

  @Get('plan-limits/:planId')
  @ApiOperation({ summary: 'Get plan limits for a specific plan' })
  @ApiResponse({ status: 200, description: 'Plan limits retrieved successfully' })
  async getPlanLimits(@CurrentUser() user: any, @Param('planId') planId: PlanId) {
    return this.subscriptionService.getPlanLimits(planId);
  }
}

