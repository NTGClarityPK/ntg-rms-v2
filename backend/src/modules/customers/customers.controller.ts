import { Controller, Get, Post, Put, Body, Param, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateCustomerDto, CreateCustomerAddressDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { GetCustomersDto } from './dto/get-customers.dto';

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
    @Query() queryDto: GetCustomersDto,
  ) {
    const { search, minOrders, minSpent, branchId, language, ...paginationDto } = queryDto;
    return this.customersService.getCustomers(
      user.tenantId,
      {
        search,
        minOrders: minOrders ? Number(minOrders) : undefined,
        minSpent: minSpent ? Number(minSpent) : undefined,
        branchId,
      },
      paginationDto,
      language || 'en',
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by ID with order history' })
  getCustomerById(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('language') language?: string,
  ) {
    return this.customersService.getCustomerById(user.tenantId, id, language || 'en');
  }

  @Post()
  @ApiOperation({ summary: 'Create a new customer' })
  createCustomer(
    @CurrentUser() user: any,
    @Body() createDto: CreateCustomerDto,
    @Query('branchId') branchId?: string,
  ) {
    return this.customersService.createCustomer(user.tenantId, createDto, branchId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a customer' })
  updateCustomer(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateCustomerDto,
    @Query('language') language?: string,
  ) {
    return this.customersService.updateCustomer(user.tenantId, id, updateDto, language || 'en', user.id);
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
