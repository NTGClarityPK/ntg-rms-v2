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
  getCategories(@CurrentUser() user: any) {
    return this.menuService.getCategories(user.tenantId);
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
    @Query('categoryId') categoryId?: string,
  ) {
    return this.menuService.getFoodItems(user.tenantId, categoryId);
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
  getAddOnGroups(@CurrentUser() user: any) {
    return this.menuService.getAddOnGroups(user.tenantId);
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
  getMenus(@CurrentUser() user: any) {
    return this.menuService.getMenus(user.tenantId);
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
}
