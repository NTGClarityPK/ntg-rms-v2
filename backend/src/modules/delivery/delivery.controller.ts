import { Controller, Get, Post, Put, Body, Param, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DeliveryService } from './delivery.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AssignDeliveryDto } from './dto/assign-delivery.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';

@ApiTags('delivery')
@Controller('delivery')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get('orders')
  @ApiOperation({ summary: 'Get delivery orders' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'assigned', 'out_for_delivery', 'delivered', 'cancelled'] })
  @ApiQuery({ name: 'deliveryPersonId', required: false, type: String })
  @ApiQuery({ name: 'branchId', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  getDeliveryOrders(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('deliveryPersonId') deliveryPersonId?: string,
    @Query('branchId') branchId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.deliveryService.getDeliveryOrders(user.tenantId, {
      status: status as any,
      deliveryPersonId,
      branchId,
      startDate,
      endDate,
    });
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Get delivery by ID' })
  getDeliveryById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.deliveryService.getDeliveryById(user.tenantId, id);
  }

  @Get('personnel')
  @ApiOperation({ summary: 'Get available delivery personnel' })
  @ApiQuery({ name: 'branchId', required: false, type: String })
  getAvailableDeliveryPersonnel(
    @CurrentUser() user: any,
    @Query('branchId') branchId?: string,
  ) {
    return this.deliveryService.getAvailableDeliveryPersonnel(user.tenantId, branchId);
  }

  @Post('assign')
  @ApiOperation({ summary: 'Assign delivery to personnel' })
  assignDelivery(@CurrentUser() user: any, @Body() assignDto: AssignDeliveryDto) {
    return this.deliveryService.assignDelivery(user.tenantId, user.id, assignDto);
  }

  @Put('orders/:id/status')
  @ApiOperation({ summary: 'Update delivery status' })
  updateDeliveryStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateDeliveryStatusDto,
  ) {
    return this.deliveryService.updateDeliveryStatus(user.tenantId, user.id, id, updateDto);
  }
}

