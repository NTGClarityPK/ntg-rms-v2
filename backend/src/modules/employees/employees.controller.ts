import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

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
    @Query('branchId') branchId?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
  ) {
    return this.employeesService.getEmployees(user.tenantId, { branchId, role, status });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get employee by ID' })
  getEmployeeById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.employeesService.getEmployeeById(user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new employee' })
  createEmployee(@CurrentUser() user: any, @Body() createDto: CreateEmployeeDto) {
    return this.employeesService.createEmployee(user.tenantId, user.id, createDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an employee' })
  updateEmployee(@CurrentUser() user: any, @Param('id') id: string, @Body() updateDto: UpdateEmployeeDto) {
    return this.employeesService.updateEmployee(user.tenantId, id, updateDto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an employee (soft delete)' })
  deleteEmployee(@CurrentUser() user: any, @Param('id') id: string) {
    return this.employeesService.deleteEmployee(user.tenantId, id);
  }
}
