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
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TranslationService } from './services/translation.service';
import { GeminiTranslationService } from './services/gemini-translation.service';
import { CreateTranslationDto } from './dto/create-translation.dto';
import { UpdateTranslationDto } from './dto/update-translation.dto';
import { GetTranslationDto } from './dto/get-translation.dto';
import { CreateLanguageDto, UpdateLanguageDto, RetranslateDto } from './dto/manage-language.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { EntityType } from './dto/create-translation.dto';

@ApiTags('translations')
@Controller('translations')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class TranslationsController {
  constructor(
    private readonly translationsService: TranslationService,
    private readonly geminiTranslationService: GeminiTranslationService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create translations for an entity field' })
  @ApiResponse({ status: 201, description: 'Translations created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createTranslations(@Body() dto: CreateTranslationDto, @Request() req: any) {
    const tenantId = req.user?.tenantId || req.user?.tenant_id;
    return this.translationsService.createTranslations(dto, req.user?.id, tenantId);
  }

  @Put()
  @ApiOperation({ summary: 'Update a specific translation (manual edit)' })
  @ApiResponse({ status: 200, description: 'Translation updated successfully' })
  @ApiResponse({ status: 404, description: 'Translation not found' })
  async updateTranslation(@Body() dto: UpdateTranslationDto, @Request() req: any) {
    await this.translationsService.updateTranslation(dto, req.user?.id);
    return { message: 'Translation updated successfully' };
  }

  @Get('entity/:entityType/:entityId')
  @ApiOperation({ summary: 'Get all translations for an entity' })
  @ApiResponse({ status: 200, description: 'Translations retrieved successfully' })
  async getEntityTranslations(
    @Param('entityType') entityType: EntityType,
    @Param('entityId') entityId: string,
  ) {
    return this.translationsService.getEntityTranslations(entityType, entityId);
  }

  @Get('translate')
  @ApiOperation({ summary: 'Get translation for a specific field in a language' })
  @ApiResponse({ status: 200, description: 'Translation retrieved successfully' })
  async getTranslation(@Query() query: GetTranslationDto) {
    const translation = await this.translationsService.getTranslation({
      entityType: query.entityType,
      entityId: query.entityId,
      languageCode: query.languageCode,
      fieldName: query.fieldName,
      fallbackLanguage: query.fallbackLanguage,
    });
    return { translation };
  }

  @Get('languages')
  @ApiOperation({ summary: 'Get all supported languages' })
  @ApiResponse({ status: 200, description: 'Languages retrieved successfully' })
  async getSupportedLanguages(@Query('activeOnly') activeOnly?: string) {
    const active = activeOnly !== 'false';
    return this.translationsService.getSupportedLanguages(active);
  }

  @Get('languages/default')
  @ApiOperation({ summary: 'Get default language' })
  @ApiResponse({ status: 200, description: 'Default language retrieved successfully' })
  async getDefaultLanguage() {
    return this.translationsService.getDefaultLanguage();
  }

  @Get('delete/:entityType/:entityId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete all translations for an entity' })
  @ApiResponse({ status: 204, description: 'Translations deleted successfully' })
  async deleteEntityTranslations(
    @Param('entityType') entityType: EntityType,
    @Param('entityId') entityId: string,
  ) {
    await this.translationsService.deleteEntityTranslations(entityType, entityId);
    return { message: 'Translations deleted successfully' };
  }

  @Get('cache/stats')
  @ApiOperation({ summary: 'Get translation cache statistics' })
  @ApiResponse({ status: 200, description: 'Cache statistics retrieved successfully' })
  async getCacheStats() {
    return this.geminiTranslationService.getCacheStats();
  }

  @Post('cache/clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear expired translation cache entries' })
  @ApiResponse({ status: 200, description: 'Cache cleared successfully' })
  async clearExpiredCache() {
    this.geminiTranslationService.clearExpiredCache();
    const stats = this.geminiTranslationService.getCacheStats();
    return {
      message: 'Expired cache entries cleared',
      cacheStats: stats,
    };
  }

  // ==================== ADMIN ENDPOINTS (Phase 5: Language Management) ====================

  @Post('admin/languages')
  @Roles('tenant_owner')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new supported language (Admin only)' })
  @ApiResponse({ status: 201, description: 'Language created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createLanguage(@Body() dto: CreateLanguageDto) {
    return this.translationsService.createLanguage(dto);
  }

  @Put('admin/languages/:code')
  @Roles('tenant_owner')
  @ApiOperation({ summary: 'Update a supported language (Admin only)' })
  @ApiResponse({ status: 200, description: 'Language updated successfully' })
  @ApiResponse({ status: 404, description: 'Language not found' })
  async updateLanguage(@Param('code') code: string, @Body() dto: UpdateLanguageDto) {
    return this.translationsService.updateLanguage(code, dto);
  }

  @Get('admin/languages')
  @Roles('tenant_owner')
  @ApiOperation({ summary: 'Get all languages including inactive (Admin only)' })
  @ApiResponse({ status: 200, description: 'Languages retrieved successfully' })
  async getAllLanguagesAdmin(@Query('activeOnly') activeOnly?: string) {
    const active = activeOnly !== 'false';
    return this.translationsService.getSupportedLanguages(active);
  }

  @Delete('admin/languages/:code')
  @Roles('tenant_owner')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a language (soft delete - Admin only)' })
  @ApiResponse({ status: 200, description: 'Language deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete default language' })
  async deleteLanguage(@Param('code') code: string) {
    return this.translationsService.deleteLanguage(code);
  }

  @Post('admin/retranslate')
  @Roles('tenant_owner')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-translate an entity using AI (Admin only)' })
  @ApiResponse({ status: 200, description: 'Translations regenerated successfully' })
  @ApiResponse({ status: 404, description: 'Entity not found' })
  async retranslate(@Body() dto: RetranslateDto, @Request() req: any) {
    return this.translationsService.retranslate(dto, req.user?.id);
  }

  // ==================== TENANT LANGUAGE MANAGEMENT ====================

  @Get('tenant/languages')
  @ApiOperation({ summary: 'Get enabled languages for current tenant' })
  @ApiResponse({ status: 200, description: 'Tenant languages retrieved successfully' })
  async getTenantLanguages(@Request() req: any) {
    const tenantId = req.user?.tenantId || req.user?.tenant_id;
    if (!tenantId) {
      throw new Error('Tenant ID not found in user context');
    }
    return this.translationsService.getTenantLanguages(tenantId);
  }

  @Get('tenant/languages/available')
  @ApiOperation({ summary: 'Get available languages that can be added for current tenant' })
  @ApiResponse({ status: 200, description: 'Available languages retrieved successfully' })
  async getAvailableLanguagesForTenant(@Request() req: any) {
    const tenantId = req.user?.tenantId || req.user?.tenant_id;
    if (!tenantId) {
      throw new Error('Tenant ID not found in user context');
    }
    return this.translationsService.getAvailableLanguagesForTenant(tenantId);
  }

  @Post('tenant/languages/:code')
  @Roles('tenant_owner')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable a language for current tenant and translate existing data' })
  @ApiResponse({ status: 200, description: 'Language enabled and data translated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - language already enabled or invalid' })
  async enableLanguageForTenant(@Param('code') code: string, @Request() req: any) {
    const tenantId = req.user?.tenantId || req.user?.tenant_id;
    if (!tenantId) {
      throw new Error('Tenant ID not found in user context');
    }
    return this.translationsService.enableLanguageForTenant(tenantId, code.toLowerCase(), req.user?.id);
  }
}

