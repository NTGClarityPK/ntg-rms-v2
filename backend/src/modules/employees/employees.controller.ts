import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query, UseInterceptors, UploadedFile, Res, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Response } from 'express';
import { EmployeesService } from './employees.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { GetEmployeesDto } from './dto/get-employees.dto';

@ApiTags('employees')
@Controller('employees')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all employees' })
  getEmployees(
    @CurrentUser() user: any,
    @Query() queryDto: GetEmployeesDto,
  ) {
    const { branchId, role, status, language, ...paginationDto } = queryDto;
    return this.employeesService.getEmployees(
      user.tenantId,
      { branchId, role, status },
      paginationDto,
      language || 'en',
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get employee by ID' })
  getEmployeeById(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('language') language?: string,
  ) {
    return this.employeesService.getEmployeeById(user.tenantId, id, language || 'en');
  }

  @Post()
  @ApiOperation({ summary: 'Create a new employee' })
  createEmployee(@CurrentUser() user: any, @Body() createDto: CreateEmployeeDto) {
    return this.employeesService.createEmployee(user.tenantId, user.id, createDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an employee' })
  updateEmployee(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateEmployeeDto,
    @Query('language') language?: string,
  ) {
    return this.employeesService.updateEmployee(user.tenantId, id, updateDto, user.id, language || 'en');
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an employee (soft delete)' })
  deleteEmployee(@CurrentUser() user: any, @Param('id') id: string) {
    return this.employeesService.deleteEmployee(user.tenantId, id);
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
    const buffer = await this.employeesService.generateBulkImportSample(user.tenantId);
    const filename = 'bulk-import-employees-sample.xlsx';
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Post('bulk-import')
  @ApiOperation({ summary: 'Bulk import employees from Excel file' })
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
  async bulkImportEmployees(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required');
    }
    return this.employeesService.bulkImportEmployees(user.tenantId, file.buffer, user.id);
  }
}
