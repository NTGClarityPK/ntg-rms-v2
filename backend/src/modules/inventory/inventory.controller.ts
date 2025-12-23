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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { CreateStockTransactionDto } from './dto/create-stock-transaction.dto';
import { AddStockDto } from './dto/add-stock.dto';
import { DeductStockDto } from './dto/deduct-stock.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';
import { InventoryReportsQueryDto } from './dto/inventory-reports.dto';
import { PaginationDto, PaginationParams } from '../../common/dto/pagination.dto';

@ApiTags('inventory')
@Controller('inventory')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ============================================
  // INGREDIENT MANAGEMENT
  // ============================================

  @Get('ingredients')
  @ApiOperation({ summary: 'Get all ingredients' })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'isActive', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getIngredients(
    @CurrentUser() user: any,
    @Query('category') category?: string,
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: any = {};
    if (category) filters.category = category;
    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }
    
    const pagination: PaginationParams = {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    };
    
    return this.inventoryService.getIngredients(user.tenantId, filters, pagination);
  }

  @Get('ingredients/:id')
  @ApiOperation({ summary: 'Get ingredient by ID' })
  getIngredientById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.inventoryService.getIngredientById(user.tenantId, id);
  }

  @Post('ingredients')
  @ApiOperation({ summary: 'Create a new ingredient' })
  createIngredient(@CurrentUser() user: any, @Body() createDto: CreateIngredientDto) {
    return this.inventoryService.createIngredient(user.tenantId, createDto);
  }

  @Put('ingredients/:id')
  @ApiOperation({ summary: 'Update an ingredient' })
  updateIngredient(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateIngredientDto,
  ) {
    return this.inventoryService.updateIngredient(user.tenantId, id, updateDto);
  }

  @Delete('ingredients/:id')
  @ApiOperation({ summary: 'Delete an ingredient (soft delete)' })
  deleteIngredient(@CurrentUser() user: any, @Param('id') id: string) {
    return this.inventoryService.deleteIngredient(user.tenantId, id);
  }

  // ============================================
  // STOCK MANAGEMENT
  // ============================================

  @Post('stock/add')
  @ApiOperation({ summary: 'Add stock (Purchase Entry)' })
  addStock(@CurrentUser() user: any, @Body() addDto: AddStockDto) {
    return this.inventoryService.addStock(user.tenantId, user.id, addDto);
  }

  @Post('stock/deduct')
  @ApiOperation({ summary: 'Deduct stock (Usage/Waste)' })
  deductStock(@CurrentUser() user: any, @Body() deductDto: DeductStockDto) {
    return this.inventoryService.deductStock(user.tenantId, user.id, deductDto);
  }

  @Post('stock/adjust')
  @ApiOperation({ summary: 'Adjust stock (Physical count correction)' })
  adjustStock(@CurrentUser() user: any, @Body() adjustDto: AdjustStockDto) {
    return this.inventoryService.adjustStock(user.tenantId, user.id, adjustDto);
  }

  @Post('stock/transfer')
  @ApiOperation({ summary: 'Transfer stock between branches' })
  transferStock(@CurrentUser() user: any, @Body() transferDto: TransferStockDto) {
    return this.inventoryService.transferStock(user.tenantId, user.id, transferDto);
  }

  @Get('stock/transactions')
  @ApiOperation({ summary: 'Get stock transactions' })
  @ApiQuery({ name: 'branchId', required: false, type: String })
  @ApiQuery({ name: 'ingredientId', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getStockTransactions(
    @CurrentUser() user: any,
    @Query() query: InventoryReportsQueryDto,
  ) {
    // Create filters without pagination fields
    const filters: InventoryReportsQueryDto = {
      branchId: query.branchId,
      ingredientId: query.ingredientId,
      startDate: query.startDate,
      endDate: query.endDate,
      category: query.category,
      lowStockOnly: query.lowStockOnly,
    };
    
    // Only pass pagination if at least one parameter is provided
    const pagination: PaginationParams | undefined = 
      query.page !== undefined || query.limit !== undefined
        ? {
            page: query.page,
            limit: query.limit,
          }
        : undefined;
    
    return this.inventoryService.getStockTransactions(user.tenantId, filters, pagination);
  }

  // ============================================
  // RECIPE MANAGEMENT
  // ============================================

  @Get('recipes')
  @ApiOperation({ summary: 'Get all recipes' })
  @ApiQuery({ name: 'foodItemId', required: false, type: String })
  @ApiQuery({ name: 'addOnId', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getRecipes(
    @CurrentUser() user: any,
    @Query('foodItemId') foodItemId?: string,
    @Query('addOnId') addOnId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pagination: PaginationParams = {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    };
    return this.inventoryService.getRecipes(user.tenantId, foodItemId, addOnId, pagination);
  }

  @Get('recipes/food-item/:foodItemId')
  @ApiOperation({ summary: 'Get recipe by food item ID' })
  getRecipeByFoodItemId(@CurrentUser() user: any, @Param('foodItemId') foodItemId: string) {
    return this.inventoryService.getRecipeByFoodItemId(user.tenantId, foodItemId);
  }

  @Post('recipes')
  @ApiOperation({ summary: 'Create or update recipe for a food item' })
  createRecipe(@CurrentUser() user: any, @Body() createDto: CreateRecipeDto) {
    return this.inventoryService.createOrUpdateRecipe(user.tenantId, createDto);
  }

  @Delete('recipes/food-item/:foodItemId')
  @ApiOperation({ summary: 'Delete recipe for a food item' })
  deleteRecipe(@CurrentUser() user: any, @Param('foodItemId') foodItemId: string) {
    return this.inventoryService.deleteRecipe(user.tenantId, foodItemId);
  }

  @Delete('recipes/add-on/:addOnId')
  @ApiOperation({ summary: 'Delete recipe for an add-on' })
  deleteAddOnRecipe(@CurrentUser() user: any, @Param('addOnId') addOnId: string) {
    return this.inventoryService.deleteRecipe(user.tenantId, undefined, addOnId);
  }

  // ============================================
  // INVENTORY REPORTS
  // ============================================

  @Get('reports/current-stock')
  @ApiOperation({ summary: 'Get current stock report' })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'lowStockOnly', required: false, type: Boolean })
  getCurrentStockReport(
    @CurrentUser() user: any,
    @Query() query: InventoryReportsQueryDto,
  ) {
    return this.inventoryService.getCurrentStockReport(user.tenantId, query);
  }

  @Get('reports/low-stock-alerts')
  @ApiOperation({ summary: 'Get low stock alerts' })
  getLowStockAlerts(@CurrentUser() user: any) {
    return this.inventoryService.getLowStockAlerts(user.tenantId);
  }

  @Get('reports/stock-movement')
  @ApiOperation({ summary: 'Get stock movement report' })
  @ApiQuery({ name: 'branchId', required: false, type: String })
  @ApiQuery({ name: 'ingredientId', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  getStockMovementReport(
    @CurrentUser() user: any,
    @Query() query: InventoryReportsQueryDto,
  ) {
    return this.inventoryService.getStockMovementReport(user.tenantId, query);
  }

  // ============================================
  // LEGACY ENDPOINTS (for backward compatibility)
  // ============================================

  @Post('stock-transactions')
  @ApiOperation({ summary: 'Create a stock transaction (legacy)' })
  createStockTransaction(
    @CurrentUser() user: any,
    @Body() createDto: CreateStockTransactionDto,
  ) {
    // Map legacy DTO to new structure
    if (createDto.transactionType === 'purchase') {
      const addDto: AddStockDto = {
        ingredientId: createDto.ingredientId,
        quantity: createDto.quantity,
        unitCost: createDto.unitCost || 0,
        reason: createDto.reason,
      };
      return this.inventoryService.addStock(user.tenantId, user.id, addDto);
    } else {
      const deductDto: DeductStockDto = {
        ingredientId: createDto.ingredientId,
        quantity: createDto.quantity,
        reason: createDto.reason || 'Stock usage',
      };
      return this.inventoryService.deductStock(user.tenantId, user.id, deductDto);
    }
  }
}
