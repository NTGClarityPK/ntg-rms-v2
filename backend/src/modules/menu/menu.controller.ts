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
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { MenuService } from './menu.service';
import { StorageService } from './utils/storage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TimeoutInterceptor } from '../../common/interceptors/timeout.interceptor';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateFoodItemDto } from './dto/create-food-item.dto';
import { UpdateFoodItemDto } from './dto/update-food-item.dto';
import { CreateAddOnGroupDto } from './dto/create-add-on-group.dto';
import { UpdateAddOnGroupDto } from './dto/update-add-on-group.dto';
import { CreateAddOnDto } from './dto/create-add-on.dto';
import { UpdateAddOnDto } from './dto/update-add-on.dto';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { CreateBuffetDto } from './dto/create-buffet.dto';
import { UpdateBuffetDto } from './dto/update-buffet.dto';
import { CreateComboMealDto } from './dto/create-combo-meal.dto';
import { UpdateComboMealDto } from './dto/update-combo-meal.dto';
import { CreateVariationGroupDto } from './dto/create-variation-group.dto';
import { UpdateVariationGroupDto } from './dto/update-variation-group.dto';
import { CreateVariationDto } from './dto/create-variation.dto';
import { UpdateVariationDto } from './dto/update-variation.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { GetFoodItemsDto } from './dto/get-food-items.dto';

@ApiTags('menu')
@Controller('menu')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class MenuController {
  constructor(
    private readonly menuService: MenuService,
    private readonly storageService: StorageService,
  ) {}

  // ============================================
  // CATEGORY MANAGEMENT
  // ============================================

  @Get('categories')
  @ApiOperation({ summary: 'Get all categories with subcategories' })
  getCategories(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('branchId') branchId?: string,
    @Query('language') language?: string,
  ) {
    const paginationDto: PaginationDto = {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      branchId: branchId,
    };
    return this.menuService.getCategories(user.tenantId, paginationDto, branchId, language || 'en');
  }

  @Get('categories/:id')
  @ApiOperation({ summary: 'Get category by ID' })
  getCategoryById(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('language') language?: string,
  ) {
    return this.menuService.getCategoryById(user.tenantId, id, language || 'en');
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create a new category' })
  createCategory(
    @CurrentUser() user: any,
    @Body() createDto: CreateCategoryDto,
    @Query('branchId') branchId?: string,
  ) {
    return this.menuService.createCategory(user.tenantId, createDto, branchId);
  }

  @Put('categories/:id')
  @ApiOperation({ summary: 'Update category' })
  updateCategory(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateCategoryDto,
    @Query('language') language?: string,
  ) {
    return this.menuService.updateCategory(user.tenantId, id, updateDto, language || 'en', user.id);
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: 'Delete category (soft delete)' })
  deleteCategory(@CurrentUser() user: any, @Param('id') id: string) {
    return this.menuService.deleteCategory(user.tenantId, id);
  }

  @Post('categories/:id/upload-image')
  @ApiOperation({ summary: 'Upload category image to Supabase Storage' })
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
  async uploadCategoryImage(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @UploadedFile() file: any,
  ) {
    const imageUrl = await this.storageService.uploadImage(
      file,
      'menu-images',
      'categories',
      user.tenantId,
    );
    
    return this.menuService.updateCategory(user.tenantId, id, { imageUrl });
  }

  // ============================================
  // FOOD ITEM MANAGEMENT
  // ============================================

  @Get('food-items')
  @ApiOperation({ summary: 'Get all food items' })
  getFoodItems(
    @CurrentUser() user: any,
    @Query() queryDto: GetFoodItemsDto,
  ) {
    const { categoryId, onlyActiveMenus, search, branchId, language, ...paginationDto } = queryDto;
    // Default to false (show all items) unless explicitly set to true
    const filterByActiveMenus = onlyActiveMenus === true;
    return this.menuService.getFoodItems(user.tenantId, categoryId, paginationDto, filterByActiveMenus, search, branchId, language || 'en');
  }

  @Get('food-items/:id')
  @ApiOperation({ summary: 'Get food item by ID' })
  getFoodItemById(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('language') language?: string,
  ) {
    return this.menuService.getFoodItemById(user.tenantId, id, language || 'en');
  }

  @Post('food-items')
  @ApiOperation({ summary: 'Create a new food item' })
  createFoodItem(
    @CurrentUser() user: any,
    @Body() createDto: CreateFoodItemDto,
    @Query('branchId') branchId?: string,
  ) {
    return this.menuService.createFoodItem(user.tenantId, createDto, branchId);
  }

  @Put('food-items/:id')
  @ApiOperation({ summary: 'Update food item' })
  updateFoodItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateFoodItemDto,
    @Query('language') language?: string,
  ) {
    return this.menuService.updateFoodItem(user.tenantId, id, updateDto, language || 'en', user.id);
  }

  @Delete('food-items/:id')
  @ApiOperation({ summary: 'Delete food item (soft delete)' })
  deleteFoodItem(@CurrentUser() user: any, @Param('id') id: string) {
    return this.menuService.deleteFoodItem(user.tenantId, id);
  }

  @Post('food-items/:id/upload-image')
  @ApiOperation({ summary: 'Upload food item image to Supabase Storage' })
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
  async uploadFoodItemImage(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @UploadedFile() file: any,
  ) {
    const imageUrl = await this.storageService.uploadImage(
      file,
      'menu-images',
      'food-items',
      user.tenantId,
    );
    
    return this.menuService.updateFoodItem(user.tenantId, id, { imageUrl });
  }

  // ============================================
  // ADD-ON GROUP MANAGEMENT
  // ============================================

  @Get('add-on-groups')
  @ApiOperation({ summary: 'Get all add-on groups' })
  getAddOnGroups(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('branchId') branchId?: string,
    @Query('language') language?: string,
  ) {
    const paginationDto: PaginationDto = {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      branchId: branchId,
    };
    return this.menuService.getAddOnGroups(user.tenantId, paginationDto, branchId, language || 'en');
  }

  @Get('add-on-groups/:id')
  @ApiOperation({ summary: 'Get add-on group by ID' })
  getAddOnGroupById(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('language') language?: string,
  ) {
    return this.menuService.getAddOnGroupById(user.tenantId, id, language || 'en');
  }

  @Post('add-on-groups')
  @ApiOperation({ summary: 'Create a new add-on group' })
  createAddOnGroup(@CurrentUser() user: any, @Body() createDto: CreateAddOnGroupDto, @Query('branchId') branchId?: string) {
    return this.menuService.createAddOnGroup(user.tenantId, createDto, branchId);
  }

  @Put('add-on-groups/:id')
  @ApiOperation({ summary: 'Update add-on group' })
  updateAddOnGroup(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateAddOnGroupDto,
    @Query('language') language?: string,
  ) {
    return this.menuService.updateAddOnGroup(user.tenantId, id, updateDto, language || 'en', user.id);
  }

  @Delete('add-on-groups/:id')
  @ApiOperation({ summary: 'Delete add-on group (soft delete)' })
  deleteAddOnGroup(@CurrentUser() user: any, @Param('id') id: string) {
    return this.menuService.deleteAddOnGroup(user.tenantId, id);
  }

  // ============================================
  // ADD-ON MANAGEMENT
  // ============================================

  @Get('add-on-groups/:addOnGroupId/add-ons')
  @ApiOperation({ summary: 'Get all add-ons in a group' })
  getAddOns(
    @CurrentUser() user: any,
    @Param('addOnGroupId') addOnGroupId: string,
    @Query('language') language?: string,
  ) {
    return this.menuService.getAddOns(user.tenantId, addOnGroupId, language || 'en');
  }

  @Get('add-on-groups/:addOnGroupId/add-ons/:id')
  @ApiOperation({ summary: 'Get add-on by ID' })
  getAddOnById(
    @CurrentUser() user: any,
    @Param('addOnGroupId') addOnGroupId: string,
    @Param('id') id: string,
    @Query('language') language?: string,
  ) {
    return this.menuService.getAddOnById(user.tenantId, addOnGroupId, id, language || 'en');
  }

  @Post('add-on-groups/:addOnGroupId/add-ons')
  @ApiOperation({ summary: 'Create a new add-on' })
  createAddOn(
    @CurrentUser() user: any,
    @Param('addOnGroupId') addOnGroupId: string,
    @Body() createDto: CreateAddOnDto,
  ) {
    return this.menuService.createAddOn(user.tenantId, { ...createDto, addOnGroupId });
  }

  @Put('add-on-groups/:addOnGroupId/add-ons/:id')
  @ApiOperation({ summary: 'Update add-on' })
  updateAddOn(
    @CurrentUser() user: any,
    @Param('addOnGroupId') addOnGroupId: string,
    @Param('id') id: string,
    @Body() updateDto: UpdateAddOnDto,
    @Query('language') language?: string,
  ) {
    return this.menuService.updateAddOn(user.tenantId, addOnGroupId, id, updateDto, language || 'en', user.id);
  }

  @Delete('add-on-groups/:addOnGroupId/add-ons/:id')
  @ApiOperation({ summary: 'Delete add-on (soft delete)' })
  deleteAddOn(
    @CurrentUser() user: any,
    @Param('addOnGroupId') addOnGroupId: string,
    @Param('id') id: string,
  ) {
    return this.menuService.deleteAddOn(user.tenantId, addOnGroupId, id);
  }

  // ============================================
  // MENU MANAGEMENT
  // ============================================

  @Get('menus')
  @ApiOperation({ summary: 'Get all menus (grouped by menu type)' })
  getMenus(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('branchId') branchId?: string,
    @Query('language') language?: string,
  ) {
    const paginationDto: PaginationDto = {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      branchId: branchId,
    };
    return this.menuService.getMenus(user.tenantId, paginationDto, branchId, language || 'en');
  }

  @Get('menus/:menuType/items')
  @ApiOperation({ summary: 'Get food items in a menu' })
  getMenuItems(
    @CurrentUser() user: any,
    @Param('menuType') menuType: string,
  ) {
    return this.menuService.getMenuItems(user.tenantId, menuType);
  }

  @Post('menus/items/batch')
  @ApiOperation({ summary: 'Get food item IDs for multiple menu types at once' })
  @ApiResponse({ status: 200, description: 'Map of menu type to array of food item IDs' })
  getMenuItemsForTypes(
    @CurrentUser() user: any,
    @Body() body: { menuTypes: string[] },
    @Query('branchId') branchId?: string,
  ) {
    return this.menuService.getMenuItemsForTypes(user.tenantId, body.menuTypes, branchId);
  }

  @Post('menus/:menuType/assign-items')
  @ApiOperation({ summary: 'Assign food items to a menu' })
  assignItemsToMenu(
    @CurrentUser() user: any,
    @Param('menuType') menuType: string,
    @Body() body: { foodItemIds: string[] },
  ) {
    return this.menuService.assignItemsToMenu(user.tenantId, menuType, body.foodItemIds);
  }

  @Put('menus/:menuType/activate')
  @ApiOperation({ summary: 'Activate or deactivate a menu' })
  activateMenu(
    @CurrentUser() user: any,
    @Param('menuType') menuType: string,
    @Body() body: { isActive: boolean },
  ) {
    return this.menuService.activateMenu(user.tenantId, menuType, body.isActive);
  }

  @Post('menus')
  @ApiOperation({ summary: 'Create a new menu type' })
  createMenu(@CurrentUser() user: any, @Body() createDto: CreateMenuDto, @Query('branchId') branchId?: string) {
    return this.menuService.createMenu(user.tenantId, createDto, branchId);
  }

  @Delete('menus/:menuType')
  @ApiOperation({ summary: 'Delete a menu type' })
  deleteMenu(@CurrentUser() user: any, @Param('menuType') menuType: string) {
    return this.menuService.deleteMenu(user.tenantId, menuType);
  }

  // ============================================
  // BUFFET MANAGEMENT
  // ============================================

  @Get('buffets')
  @ApiOperation({ summary: 'Get all buffets' })
  getBuffets(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('branchId') branchId?: string,
    @Query('language') language?: string,
  ) {
    const paginationDto: PaginationDto = {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      branchId: branchId,
    };
    return this.menuService.getBuffets(user.tenantId, paginationDto, branchId, language || 'en');
  }

  @Get('buffets/:id')
  @ApiOperation({ summary: 'Get buffet by ID' })
  getBuffetById(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('language') language?: string,
  ) {
    return this.menuService.getBuffetById(user.tenantId, id, language || 'en');
  }

  @Post('buffets')
  @ApiOperation({ summary: 'Create a new buffet' })
  createBuffet(@CurrentUser() user: any, @Body() createDto: CreateBuffetDto, @Query('branchId') branchId?: string) {
    return this.menuService.createBuffet(user.tenantId, createDto, branchId);
  }

  @Put('buffets/:id')
  @ApiOperation({ summary: 'Update buffet' })
  updateBuffet(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateBuffetDto,
    @Query('language') language?: string,
  ) {
    return this.menuService.updateBuffet(user.tenantId, id, updateDto, language || 'en', user.id);
  }

  @Delete('buffets/:id')
  @ApiOperation({ summary: 'Delete buffet (soft delete)' })
  deleteBuffet(@CurrentUser() user: any, @Param('id') id: string) {
    return this.menuService.deleteBuffet(user.tenantId, id);
  }

  @Post('buffets/:id/upload-image')
  @ApiOperation({ summary: 'Upload buffet image to Supabase Storage' })
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
  async uploadBuffetImage(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @UploadedFile() file: any,
  ) {
    return this.menuService.uploadBuffetImage(user.tenantId, id, file);
  }

  // ============================================
  // COMBO MEAL MANAGEMENT
  // ============================================

  @Get('combo-meals')
  @ApiOperation({ summary: 'Get all combo meals' })
  getComboMeals(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('branchId') branchId?: string,
    @Query('language') language?: string,
  ) {
    const paginationDto: PaginationDto = {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      branchId: branchId,
    };
    return this.menuService.getComboMeals(user.tenantId, paginationDto, branchId, language || 'en');
  }

  @Get('combo-meals/:id')
  @ApiOperation({ summary: 'Get combo meal by ID' })
  getComboMealById(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('language') language?: string,
  ) {
    return this.menuService.getComboMealById(user.tenantId, id, language || 'en');
  }

  @Post('combo-meals')
  @ApiOperation({ summary: 'Create a new combo meal' })
  createComboMeal(@CurrentUser() user: any, @Body() createDto: CreateComboMealDto, @Query('branchId') branchId?: string) {
    return this.menuService.createComboMeal(user.tenantId, createDto, branchId);
  }

  @Put('combo-meals/:id')
  @ApiOperation({ summary: 'Update combo meal' })
  updateComboMeal(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateComboMealDto,
    @Query('language') language?: string,
  ) {
    return this.menuService.updateComboMeal(user.tenantId, id, updateDto, language || 'en', user.id);
  }

  @Delete('combo-meals/:id')
  @ApiOperation({ summary: 'Delete combo meal (soft delete)' })
  deleteComboMeal(@CurrentUser() user: any, @Param('id') id: string) {
    return this.menuService.deleteComboMeal(user.tenantId, id);
  }

  @Post('combo-meals/:id/upload-image')
  @ApiOperation({ summary: 'Upload combo meal image to Supabase Storage' })
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
  async uploadComboMealImage(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @UploadedFile() file: any,
  ) {
    return this.menuService.uploadComboMealImage(user.tenantId, id, file);
  }

  // ============================================
  // VARIATION GROUP MANAGEMENT
  // ============================================

  @Get('variation-groups')
  @ApiOperation({ summary: 'Get all variation groups' })
  getVariationGroups(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('branchId') branchId?: string,
    @Query('language') language?: string,
  ) {
    const paginationDto: PaginationDto = {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      branchId: branchId,
    };
    return this.menuService.getVariationGroups(user.tenantId, paginationDto, branchId, language || 'en');
  }

  @Get('variation-groups/:id')
  @ApiOperation({ summary: 'Get variation group by ID' })
  getVariationGroupById(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('language') language?: string,
  ) {
    return this.menuService.getVariationGroupById(user.tenantId, id, language || 'en');
  }

  @Post('variation-groups')
  @ApiOperation({ summary: 'Create a new variation group' })
  createVariationGroup(@CurrentUser() user: any, @Body() createDto: CreateVariationGroupDto, @Query('branchId') branchId?: string) {
    return this.menuService.createVariationGroup(user.tenantId, createDto, branchId);
  }

  @Put('variation-groups/:id')
  @ApiOperation({ summary: 'Update variation group' })
  updateVariationGroup(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateVariationGroupDto,
    @Query('language') language?: string,
  ) {
    return this.menuService.updateVariationGroup(user.tenantId, id, updateDto, language || 'en', user.id);
  }

  @Delete('variation-groups/:id')
  @ApiOperation({ summary: 'Delete variation group (soft delete)' })
  deleteVariationGroup(@CurrentUser() user: any, @Param('id') id: string) {
    return this.menuService.deleteVariationGroup(user.tenantId, id);
  }

  // ============================================
  // VARIATION MANAGEMENT
  // ============================================

  @Get('variation-groups/:variationGroupId/variations')
  @ApiOperation({ summary: 'Get all variations in a group' })
  getVariations(
    @CurrentUser() user: any,
    @Param('variationGroupId') variationGroupId: string,
    @Query('language') language?: string,
  ) {
    return this.menuService.getVariations(user.tenantId, variationGroupId, language || 'en');
  }

  @Get('variation-groups/:variationGroupId/variations/:id')
  @ApiOperation({ summary: 'Get variation by ID' })
  getVariationById(
    @CurrentUser() user: any,
    @Param('variationGroupId') variationGroupId: string,
    @Param('id') id: string,
    @Query('language') language?: string,
  ) {
    return this.menuService.getVariationById(user.tenantId, variationGroupId, id, language || 'en');
  }

  @Post('variation-groups/:variationGroupId/variations')
  @ApiOperation({ summary: 'Create a new variation' })
  createVariation(
    @CurrentUser() user: any,
    @Param('variationGroupId') variationGroupId: string,
    @Body() createDto: CreateVariationDto,
  ) {
    return this.menuService.createVariation(user.tenantId, variationGroupId, createDto);
  }

  @Put('variation-groups/:variationGroupId/variations/:id')
  @ApiOperation({ summary: 'Update variation' })
  updateVariation(
    @CurrentUser() user: any,
    @Param('variationGroupId') variationGroupId: string,
    @Param('id') id: string,
    @Body() updateDto: UpdateVariationDto,
    @Query('language') language?: string,
  ) {
    return this.menuService.updateVariation(user.tenantId, variationGroupId, id, updateDto, language || 'en', user.id);
  }

  @Delete('variation-groups/:variationGroupId/variations/:id')
  @ApiOperation({ summary: 'Delete variation (soft delete)' })
  deleteVariation(
    @CurrentUser() user: any,
    @Param('variationGroupId') variationGroupId: string,
    @Param('id') id: string,
  ) {
    return this.menuService.deleteVariation(user.tenantId, variationGroupId, id);
  }

  @Get('variation-groups/:id/food-items')
  @ApiOperation({ summary: 'Get food items that use this variation group' })
  getFoodItemsWithVariationGroup(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.menuService.getFoodItemsWithVariationGroup(user.tenantId, id);
  }

  // ============================================
  // BULK IMPORT ENDPOINTS
  // ============================================

  @Get('bulk-import/:entityType/sample')
  @ApiOperation({ summary: 'Download sample Excel file for bulk import' })
  async downloadBulkImportSample(
    @CurrentUser() user: any,
    @Param('entityType') entityType: string,
    @Res() res: Response,
  ) {
    const validTypes = ['category', 'addOnGroup', 'addon', 'variationGroup', 'variation', 'foodItem', 'menu', 'buffet', 'comboMeal', 'addOnGroupAndAddOn', 'variationGroupAndVariation'];
    if (!validTypes.includes(entityType)) {
      return res.status(400).json({ message: `Invalid entity type. Valid types: ${validTypes.join(', ')}` });
    }

    const buffer = await this.menuService.generateBulkImportSample(entityType);
    const filename = `bulk-import-${entityType}-sample.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Post('bulk-import/categories')
  @ApiOperation({ summary: 'Bulk import categories from Excel file' })
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
  @UseInterceptors(FileInterceptor('file'), new TimeoutInterceptor(600000)) // 10 minutes timeout
  async bulkImportCategories(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
    @Query('branchId') branchId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required');
    }
    return this.menuService.bulkImportCategories(user.tenantId, file.buffer, branchId);
  }

  @Post('bulk-import/add-on-groups')
  @ApiOperation({ summary: 'Bulk import add-on groups from Excel file' })
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
  @UseInterceptors(FileInterceptor('file'), new TimeoutInterceptor(600000)) // 10 minutes timeout
  async bulkImportAddOnGroups(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
    @Query('branchId') branchId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required');
    }
    return this.menuService.bulkImportAddOnGroups(user.tenantId, file.buffer, branchId);
  }

  @Post('bulk-import/add-ons')
  @ApiOperation({ summary: 'Bulk import add-ons from Excel file' })
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
  @UseInterceptors(FileInterceptor('file'), new TimeoutInterceptor(600000)) // 10 minutes timeout
  async bulkImportAddOns(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required');
    }
    return this.menuService.bulkImportAddOns(user.tenantId, file.buffer);
  }

  @Post('bulk-import/add-on-groups-and-add-ons')
  @ApiOperation({ summary: 'Bulk import add-on groups and add-ons from Excel file (combined)' })
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
  @UseInterceptors(FileInterceptor('file'), new TimeoutInterceptor(600000)) // 10 minutes timeout
  async bulkImportAddOnGroupsAndAddOns(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
    @Query('branchId') branchId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required');
    }
    return this.menuService.bulkImportAddOnGroupsAndAddOns(user.tenantId, file.buffer, branchId);
  }

  @Post('bulk-import/variation-groups')
  @ApiOperation({ summary: 'Bulk import variation groups and variations from Excel file (combined)' })
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
  @UseInterceptors(FileInterceptor('file'), new TimeoutInterceptor(600000)) // 10 minutes timeout
  async bulkImportVariationGroups(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
    @Query('branchId') branchId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required');
    }
    return this.menuService.bulkImportVariationGroups(user.tenantId, file.buffer, branchId);
  }

  @Post('bulk-import/variations')
  @ApiOperation({ summary: 'Bulk import variations from Excel file' })
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
  @UseInterceptors(FileInterceptor('file'), new TimeoutInterceptor(600000)) // 10 minutes timeout
  async bulkImportVariations(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required');
    }
    return this.menuService.bulkImportVariations(user.tenantId, file.buffer);
  }

  @Post('bulk-import/variation-groups-and-variations')
  @ApiOperation({ summary: 'Bulk import variation groups and variations from Excel file (combined)' })
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
  @UseInterceptors(FileInterceptor('file'), new TimeoutInterceptor(600000)) // 10 minutes timeout
  async bulkImportVariationGroupsAndVariations(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
    @Query('branchId') branchId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required');
    }
    return this.menuService.bulkImportVariationGroupsAndVariations(user.tenantId, file.buffer, branchId);
  }

  @Post('bulk-import/food-items')
  @ApiOperation({ summary: 'Bulk import food items from Excel file' })
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
  @UseInterceptors(FileInterceptor('file'), new TimeoutInterceptor(600000)) // 10 minutes timeout
  async bulkImportFoodItems(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
    @Query('branchId') branchId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required');
    }
    return this.menuService.bulkImportFoodItems(user.tenantId, file.buffer, branchId);
  }

  @Post('bulk-import/menus')
  @ApiOperation({ summary: 'Bulk import menus from Excel file' })
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
  @UseInterceptors(FileInterceptor('file'), new TimeoutInterceptor(600000)) // 10 minutes timeout
  async bulkImportMenus(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
    @Query('branchId') branchId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required');
    }
    return this.menuService.bulkImportMenus(user.tenantId, file.buffer, branchId);
  }

  @Post('bulk-import/buffets')
  @ApiOperation({ summary: 'Bulk import buffets from Excel file' })
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
  @UseInterceptors(FileInterceptor('file'), new TimeoutInterceptor(600000)) // 10 minutes timeout
  async bulkImportBuffets(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
    @Query('branchId') branchId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required');
    }
    return this.menuService.bulkImportBuffets(user.tenantId, file.buffer, branchId);
  }

  @Post('bulk-import/combo-meals')
  @ApiOperation({ summary: 'Bulk import combo meals from Excel file' })
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
  @UseInterceptors(FileInterceptor('file'), new TimeoutInterceptor(600000)) // 10 minutes timeout
  async bulkImportComboMeals(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
    @Query('branchId') branchId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Excel file is required');
    }
    return this.menuService.bulkImportComboMeals(user.tenantId, file.buffer, branchId);
  }
}
