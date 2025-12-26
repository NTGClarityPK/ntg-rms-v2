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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { MenuService } from './menu.service';
import { StorageService } from './utils/storage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
    @Query() paginationDto?: PaginationDto,
  ) {
    return this.menuService.getCategories(user.tenantId, paginationDto);
  }

  @Get('categories/:id')
  @ApiOperation({ summary: 'Get category by ID' })
  getCategoryById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.menuService.getCategoryById(user.tenantId, id);
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create a new category' })
  createCategory(@CurrentUser() user: any, @Body() createDto: CreateCategoryDto) {
    return this.menuService.createCategory(user.tenantId, createDto);
  }

  @Put('categories/:id')
  @ApiOperation({ summary: 'Update category' })
  updateCategory(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateCategoryDto,
  ) {
    return this.menuService.updateCategory(user.tenantId, id, updateDto);
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
    const { categoryId, onlyActiveMenus, ...paginationDto } = queryDto;
    // Default to false (show all items) unless explicitly set to true
    const filterByActiveMenus = onlyActiveMenus === true;
    return this.menuService.getFoodItems(user.tenantId, categoryId, paginationDto, filterByActiveMenus);
  }

  @Get('food-items/:id')
  @ApiOperation({ summary: 'Get food item by ID' })
  getFoodItemById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.menuService.getFoodItemById(user.tenantId, id);
  }

  @Post('food-items')
  @ApiOperation({ summary: 'Create a new food item' })
  createFoodItem(@CurrentUser() user: any, @Body() createDto: CreateFoodItemDto) {
    return this.menuService.createFoodItem(user.tenantId, createDto);
  }

  @Put('food-items/:id')
  @ApiOperation({ summary: 'Update food item' })
  updateFoodItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateFoodItemDto,
  ) {
    return this.menuService.updateFoodItem(user.tenantId, id, updateDto);
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
    @Query() paginationDto?: PaginationDto,
  ) {
    return this.menuService.getAddOnGroups(user.tenantId, paginationDto);
  }

  @Get('add-on-groups/:id')
  @ApiOperation({ summary: 'Get add-on group by ID' })
  getAddOnGroupById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.menuService.getAddOnGroupById(user.tenantId, id);
  }

  @Post('add-on-groups')
  @ApiOperation({ summary: 'Create a new add-on group' })
  createAddOnGroup(@CurrentUser() user: any, @Body() createDto: CreateAddOnGroupDto) {
    return this.menuService.createAddOnGroup(user.tenantId, createDto);
  }

  @Put('add-on-groups/:id')
  @ApiOperation({ summary: 'Update add-on group' })
  updateAddOnGroup(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateAddOnGroupDto,
  ) {
    return this.menuService.updateAddOnGroup(user.tenantId, id, updateDto);
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
  ) {
    return this.menuService.getAddOns(user.tenantId, addOnGroupId);
  }

  @Get('add-on-groups/:addOnGroupId/add-ons/:id')
  @ApiOperation({ summary: 'Get add-on by ID' })
  getAddOnById(
    @CurrentUser() user: any,
    @Param('addOnGroupId') addOnGroupId: string,
    @Param('id') id: string,
  ) {
    return this.menuService.getAddOnById(user.tenantId, addOnGroupId, id);
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
  ) {
    return this.menuService.updateAddOn(user.tenantId, addOnGroupId, id, updateDto);
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
    @Query() paginationDto?: PaginationDto,
  ) {
    return this.menuService.getMenus(user.tenantId, paginationDto);
  }

  @Get('menus/:menuType/items')
  @ApiOperation({ summary: 'Get food items in a menu' })
  getMenuItems(
    @CurrentUser() user: any,
    @Param('menuType') menuType: string,
  ) {
    return this.menuService.getMenuItems(user.tenantId, menuType);
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
  createMenu(@CurrentUser() user: any, @Body() createDto: CreateMenuDto) {
    return this.menuService.createMenu(user.tenantId, createDto);
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
    @Query() paginationDto?: PaginationDto,
  ) {
    return this.menuService.getBuffets(user.tenantId, paginationDto);
  }

  @Get('buffets/:id')
  @ApiOperation({ summary: 'Get buffet by ID' })
  getBuffetById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.menuService.getBuffetById(user.tenantId, id);
  }

  @Post('buffets')
  @ApiOperation({ summary: 'Create a new buffet' })
  createBuffet(@CurrentUser() user: any, @Body() createDto: CreateBuffetDto) {
    return this.menuService.createBuffet(user.tenantId, createDto);
  }

  @Put('buffets/:id')
  @ApiOperation({ summary: 'Update buffet' })
  updateBuffet(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateBuffetDto,
  ) {
    return this.menuService.updateBuffet(user.tenantId, id, updateDto);
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
    @Query() paginationDto?: PaginationDto,
  ) {
    return this.menuService.getComboMeals(user.tenantId, paginationDto);
  }

  @Get('combo-meals/:id')
  @ApiOperation({ summary: 'Get combo meal by ID' })
  getComboMealById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.menuService.getComboMealById(user.tenantId, id);
  }

  @Post('combo-meals')
  @ApiOperation({ summary: 'Create a new combo meal' })
  createComboMeal(@CurrentUser() user: any, @Body() createDto: CreateComboMealDto) {
    return this.menuService.createComboMeal(user.tenantId, createDto);
  }

  @Put('combo-meals/:id')
  @ApiOperation({ summary: 'Update combo meal' })
  updateComboMeal(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateComboMealDto,
  ) {
    return this.menuService.updateComboMeal(user.tenantId, id, updateDto);
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
    @Query() paginationDto?: PaginationDto,
  ) {
    return this.menuService.getVariationGroups(user.tenantId, paginationDto);
  }

  @Get('variation-groups/:id')
  @ApiOperation({ summary: 'Get variation group by ID' })
  getVariationGroupById(@CurrentUser() user: any, @Param('id') id: string) {
    return this.menuService.getVariationGroupById(user.tenantId, id);
  }

  @Post('variation-groups')
  @ApiOperation({ summary: 'Create a new variation group' })
  createVariationGroup(@CurrentUser() user: any, @Body() createDto: CreateVariationGroupDto) {
    return this.menuService.createVariationGroup(user.tenantId, createDto);
  }

  @Put('variation-groups/:id')
  @ApiOperation({ summary: 'Update variation group' })
  updateVariationGroup(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateDto: UpdateVariationGroupDto,
  ) {
    return this.menuService.updateVariationGroup(user.tenantId, id, updateDto);
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
  ) {
    return this.menuService.getVariations(user.tenantId, variationGroupId);
  }

  @Get('variation-groups/:variationGroupId/variations/:id')
  @ApiOperation({ summary: 'Get variation by ID' })
  getVariationById(
    @CurrentUser() user: any,
    @Param('variationGroupId') variationGroupId: string,
    @Param('id') id: string,
  ) {
    return this.menuService.getVariationById(user.tenantId, variationGroupId, id);
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
  ) {
    return this.menuService.updateVariation(user.tenantId, variationGroupId, id, updateDto);
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
}
