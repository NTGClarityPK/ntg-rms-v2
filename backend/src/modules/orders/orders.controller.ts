import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';

@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all orders with filters' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'preparing', 'ready', 'served', 'completed', 'cancelled'] })
  @ApiQuery({ name: 'branchId', required: false, type: String })
  @ApiQuery({ name: 'orderType', required: false, enum: ['dine_in', 'takeaway', 'delivery'] })
  @ApiQuery({ name: 'paymentStatus', required: false, enum: ['unpaid', 'paid', 'partial'] })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  getOrders(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('branchId') branchId?: string,
    @Query('orderType') orderType?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.ordersService.getOrders(user.tenantId, {
      status,
      branchId,
      orderType,
      paymentStatus,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create a new order' })
  createOrder(@CurrentUser() user: any, @Body() createDto: CreateOrderDto) {
    return this.ordersService.createOrder(user.tenantId, user.id, createDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID with full details' })
  getOrderById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.ordersService.getOrderById(user.tenantId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update/modify an existing order (only if not paid)' })
  updateOrder(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateOrderDto,
  ) {
    return this.ordersService.updateOrder(user.tenantId, user.id, id, updateDto);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Update order status' })
  updateOrderStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateOrderStatus(user.tenantId, id, updateDto);
  }

  @Put(':id/payment')
  @ApiOperation({ summary: 'Update order payment status' })
  updatePaymentStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdatePaymentStatusDto,
  ) {
    return this.ordersService.updatePaymentStatus(user.tenantId, id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete order (soft delete)' })
  deleteOrder(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('reason') reason?: string,
  ) {
    return this.ordersService.deleteOrder(user.tenantId, id, reason);
  }
}

