import { Controller, Get, Post, Put, Body, Param, UseGuards, Query, UseInterceptors, UploadedFile, Res, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Response } from 'express';
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

  // ============================================
  // BULK IMPORT ENDPOINTS
  // ============================================

  @Get('bulk-import/sample')
  @ApiOperation({ summary: 'Download sample Excel file for bulk import' })
  async downloadBulkImportSample(
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const buffer = await this.customersService.generateBulkImportSample();
    const filename = 'bulk-import-customers-sample.xlsx';
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Post('bulk-import')
  @ApiOperation({ summary: 'Bulk import customers from Excel file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async bulkImportCustomers(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
    @Query('branchId') branchId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required');
    }
    return this.customersService.bulkImportCustomers(user.tenantId, file.buffer, branchId);
  }
}
