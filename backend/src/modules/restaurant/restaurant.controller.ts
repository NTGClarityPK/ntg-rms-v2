import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { 
  ApiTags, 
  ApiOperation, 
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { RestaurantService } from './restaurant.service';
import { StorageService } from '../menu/utils/storage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { CreateCounterDto } from './dto/create-counter.dto';
import { UpdateCounterDto } from './dto/update-counter.dto';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';

@ApiTags('restaurant')
@Controller('restaurant')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class RestaurantController {
  constructor(
    private readonly restaurantService: RestaurantService,
    private readonly storageService: StorageService,
  ) {}

  @Get('info')
  @ApiOperation({ summary: 'Get restaurant information' })
  @ApiResponse({ status: 200, description: 'Restaurant information retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Restaurant not found' })
  getRestaurantInfo(@CurrentUser() user: any) {
    return this.restaurantService.getRestaurantInfo(user.tenantId);
  }

  @Put('info')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update restaurant information' })
  @ApiResponse({ status: 200, description: 'Restaurant information updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Restaurant not found' })
  @ApiResponse({ status: 409, description: 'Conflict (e.g., email already exists)' })
  updateRestaurantInfo(
    @CurrentUser() user: any,
    @Body() updateDto: UpdateTenantDto,
  ) {
    return this.restaurantService.updateRestaurantInfo(user.tenantId, updateDto);
  }

  @Post('info/upload-logo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload restaurant logo to Supabase Storage' })
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
  @ApiResponse({ status: 200, description: 'Logo uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or upload failed' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
  ) {
    const logoUrl = await this.storageService.uploadImage(
      file,
      'restaurant-logos',
      'logos',
      user.tenantId,
    );
    
    // Update tenant with new logo URL
    return this.restaurantService.updateRestaurantInfo(user.tenantId, { logoUrl });
  }

  @Get('branches')
  @ApiOperation({ summary: 'Get all branches for the restaurant' })
  @ApiResponse({ status: 200, description: 'Branches retrieved successfully' })
  getBranches(@CurrentUser() user: any) {
    return this.restaurantService.getBranches(user.tenantId);
  }

  @Get('branches/:id')
  @ApiOperation({ summary: 'Get a single branch by ID' })
  @ApiParam({ name: 'id', description: 'Branch ID' })
  @ApiResponse({ status: 200, description: 'Branch retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  getBranchById(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.restaurantService.getBranchById(user.tenantId, id);
  }

  @Post('branches')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new branch' })
  @ApiResponse({ status: 201, description: 'Branch created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'Branch code already exists' })
  createBranch(
    @CurrentUser() user: any,
    @Body() createDto: CreateBranchDto,
  ) {
    return this.restaurantService.createBranch(user.tenantId, createDto);
  }

  @Put('branches/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a branch' })
  @ApiParam({ name: 'id', description: 'Branch ID' })
  @ApiResponse({ status: 200, description: 'Branch updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  @ApiResponse({ status: 409, description: 'Branch code already exists' })
  updateBranch(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateBranchDto,
  ) {
    return this.restaurantService.updateBranch(user.tenantId, id, updateDto);
  }

  @Delete('branches/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a branch (soft delete)' })
  @ApiParam({ name: 'id', description: 'Branch ID' })
  @ApiResponse({ status: 200, description: 'Branch deleted successfully' })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  deleteBranch(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.restaurantService.deleteBranch(user.tenantId, id);
  }

  @Get('counters')
  @ApiOperation({ summary: 'Get all counters for the restaurant' })
  @ApiQuery({ name: 'branchId', required: false, description: 'Filter by branch ID' })
  @ApiResponse({ status: 200, description: 'Counters retrieved successfully' })
  getCounters(
    @CurrentUser() user: any,
    @Query('branchId') branchId?: string,
  ) {
    return this.restaurantService.getCounters(user.tenantId, branchId);
  }

  @Get('counters/:id')
  @ApiOperation({ summary: 'Get a single counter by ID' })
  @ApiParam({ name: 'id', description: 'Counter ID' })
  @ApiResponse({ status: 200, description: 'Counter retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Counter not found' })
  getCounterById(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.restaurantService.getCounterById(user.tenantId, id);
  }

  @Post('counters')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new counter' })
  @ApiResponse({ status: 201, description: 'Counter created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data or branch not found' })
  @ApiResponse({ status: 409, description: 'Counter code already exists for this branch' })
  createCounter(
    @CurrentUser() user: any,
    @Body() createDto: CreateCounterDto,
  ) {
    return this.restaurantService.createCounter(user.tenantId, createDto);
  }

  @Put('counters/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a counter' })
  @ApiParam({ name: 'id', description: 'Counter ID' })
  @ApiResponse({ status: 200, description: 'Counter updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Counter not found' })
  @ApiResponse({ status: 409, description: 'Counter code already exists for this branch' })
  updateCounter(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateCounterDto,
  ) {
    return this.restaurantService.updateCounter(user.tenantId, id, updateDto);
  }

  @Delete('counters/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a counter (soft delete)' })
  @ApiParam({ name: 'id', description: 'Counter ID' })
  @ApiResponse({ status: 200, description: 'Counter deleted successfully' })
  @ApiResponse({ status: 404, description: 'Counter not found' })
  deleteCounter(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.restaurantService.deleteCounter(user.tenantId, id);
  }

  @Get('tables')
  @ApiOperation({ summary: 'Get all tables for the restaurant' })
  @ApiQuery({ name: 'branchId', required: false, description: 'Filter by branch ID' })
  @ApiResponse({ status: 200, description: 'Tables retrieved successfully' })
  getTables(
    @CurrentUser() user: any,
    @Query('branchId') branchId?: string,
  ) {
    return this.restaurantService.getTables(user.tenantId, branchId);
  }

  @Get('tables/:id')
  @ApiOperation({ summary: 'Get a single table by ID' })
  @ApiParam({ name: 'id', description: 'Table ID' })
  @ApiResponse({ status: 200, description: 'Table retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Table not found' })
  getTableById(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.restaurantService.getTableById(user.tenantId, id);
  }

  @Post('tables')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new table' })
  @ApiResponse({ status: 201, description: 'Table created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data or branch not found' })
  @ApiResponse({ status: 409, description: 'Table number already exists for this branch' })
  createTable(
    @CurrentUser() user: any,
    @Body() createDto: CreateTableDto,
  ) {
    return this.restaurantService.createTable(user.tenantId, createDto);
  }

  @Put('tables/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a table' })
  @ApiParam({ name: 'id', description: 'Table ID' })
  @ApiResponse({ status: 200, description: 'Table updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Table not found' })
  @ApiResponse({ status: 409, description: 'Table number already exists for this branch' })
  updateTable(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateTableDto,
  ) {
    return this.restaurantService.updateTable(user.tenantId, id, updateDto);
  }

  @Delete('tables/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a table (soft delete)' })
  @ApiParam({ name: 'id', description: 'Table ID' })
  @ApiResponse({ status: 200, description: 'Table deleted successfully' })
  @ApiResponse({ status: 404, description: 'Table not found' })
  deleteTable(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.restaurantService.deleteTable(user.tenantId, id);
  }
}
