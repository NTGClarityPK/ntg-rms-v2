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
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { OrdersService } from './orders.service';
import { OrdersSseService } from './orders-sse.service';
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
  constructor(
    private readonly ordersService: OrdersService,
    private readonly ordersSseService: OrdersSseService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all orders with filters' })
  @ApiQuery({ name: 'status', required: false, description: 'Order status(es). Can be comma-separated for multiple values: pending,preparing' })
  @ApiQuery({ name: 'branchId', required: false, type: String })
  @ApiQuery({ name: 'orderType', required: false, enum: ['dine_in', 'takeaway', 'delivery'] })
  @ApiQuery({ name: 'paymentStatus', required: false, enum: ['unpaid', 'paid', 'partial'] })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'includeItems', required: false, type: Boolean, description: 'Include order items in response' })
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
    @Query('includeItems') includeItems?: string,
  ) {
    // Parse status: support comma-separated values like "pending,preparing"
    const statusArray = status?.includes(',') ? status.split(',').map(s => s.trim()) : status ? [status] : undefined;
    
    return this.ordersService.getOrders(user.tenantId, {
      status: statusArray,
      branchId,
      orderType,
      paymentStatus,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      includeItems: includeItems === 'true' || includeItems === '1',
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create a new order' })
  createOrder(@CurrentUser() user: any, @Body() createDto: CreateOrderDto) {
    return this.ordersService.createOrder(user.tenantId, user.id, createDto);
  }

  @Get('kitchen/stream')
  @ApiOperation({ summary: 'Server-Sent Events stream for kitchen display order updates' })
  streamKitchenOrders(@CurrentUser() user: any, @Res({ passthrough: false }) res: Response): void {
    console.log(`📡 SSE connection opened for tenant ${user.tenantId}`);
    
    // Set SSE headers BEFORE any writes
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow CORS for SSE
    
    // Don't end the response - keep it open for streaming
    res.status(200);
    
    // Send initial connection message
    try {
      res.write(': connected\n\n');
      
      // Send a test message to verify connection works
      const testMessage = JSON.stringify({
        type: 'CONNECTION_TEST',
        tenantId: user.tenantId,
        orderId: 'test',
        message: 'SSE connection established',
      });
      res.write(`data: ${testMessage}\n\n`);
      console.log(`✅ SSE headers set and initial message sent for tenant ${user.tenantId}`);
    } catch (error) {
      console.error('❌ Error writing initial SSE message:', error);
      return;
    }
    
    // Subscribe to order updates for this tenant
    const subscription = this.ordersSseService.createTenantStream(user.tenantId).subscribe({
      next: (event) => {
        try {
          // Check if response is still writable
          if (res.writableEnded || res.destroyed) {
            console.warn(`⚠️ Cannot send SSE event - response already closed for tenant ${user.tenantId}`);
            return;
          }
          
          // Format as SSE message
          const data = JSON.stringify(event);
          console.log(`📤 Sending SSE event to tenant ${user.tenantId}:`, event.type, event.orderId);
          
          const success = res.write(`data: ${data}\n\n`);
          if (!success) {
            console.warn(`⚠️ Backpressure detected - response buffer is full for tenant ${user.tenantId}`);
            // Wait for drain event
            res.once('drain', () => {
              console.log(`✅ Response buffer drained for tenant ${user.tenantId}`);
            });
          } else {
            console.log(`✅ Successfully wrote SSE event to response for tenant ${user.tenantId}`);
          }
        } catch (error) {
          console.error('❌ Error sending SSE event:', error);
          // Don't unsubscribe on write error - connection might still be valid
        }
      },
      error: (error) => {
        console.error('❌ SSE stream error:', error);
        try {
          res.write(`event: error\ndata: ${JSON.stringify({ message: 'Stream error' })}\n\n`);
        } catch (writeError) {
          console.error('❌ Failed to write error to SSE stream:', writeError);
        }
      },
      complete: () => {
        console.log(`📡 SSE connection completed for tenant ${user.tenantId}`);
        try {
          res.end();
        } catch (error) {
          console.error('❌ Error ending SSE connection:', error);
        }
      },
    });

    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch (error) {
        console.error('❌ Heartbeat failed, connection may be closed:', error);
        clearInterval(heartbeatInterval);
        subscription.unsubscribe();
      }
    }, 30000);

    // Handle client disconnect
    const handleClose = () => {
      console.log(`📡 Client disconnected for tenant ${user.tenantId}`);
      clearInterval(heartbeatInterval);
      subscription.unsubscribe();
      try {
        res.end();
      } catch (error) {
        // Connection already closed, ignore
      }
    };

    res.on('close', handleClose);
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

