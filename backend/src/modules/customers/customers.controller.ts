import { Controller, Get, Post, Put, Body, Param, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateCustomerDto, CreateCustomerAddressDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@ApiTags('customers')
@Controller('customers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all customers' })
  getCustomers(
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('minOrders') minOrders?: number,
    @Query('minSpent') minSpent?: number,
  ) {
    return this.customersService.getCustomers(user.tenantId, {
      search,
      minOrders: minOrders ? Number(minOrders) : undefined,
      minSpent: minSpent ? Number(minSpent) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by ID with order history' })
  getCustomerById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.customersService.getCustomerById(user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new customer' })
  createCustomer(@CurrentUser() user: any, @Body() createDto: CreateCustomerDto) {
    return this.customersService.createCustomer(user.tenantId, createDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a customer' })
  updateCustomer(@CurrentUser() user: any, @Param('id') id: string, @Body() updateDto: UpdateCustomerDto) {
    return this.customersService.updateCustomer(user.tenantId, id, updateDto);
  }

  @Post(':id/addresses')
  @ApiOperation({ summary: 'Create a customer address' })
  createCustomerAddress(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() addressDto: CreateCustomerAddressDto,
  ) {
    return this.customersService.createCustomerAddress(user.tenantId, id, addressDto);
  }
}
