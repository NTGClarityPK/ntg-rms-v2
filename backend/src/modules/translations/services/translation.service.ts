import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { TranslationRepository } from '../repositories/translation.repository';
import { GeminiTranslationService } from './gemini-translation.service';
import { CreateTranslationDto, EntityType, FieldName } from '../dto/create-translation.dto';
import { UpdateTranslationDto } from '../dto/update-translation.dto';
import { GetTranslationDto } from '../dto/get-translation.dto';
import { CreateLanguageDto, UpdateLanguageDto, RetranslateDto } from '../dto/manage-language.dto';
import { TranslationResult } from './gemini-translation.service';
import { PRE_TRANSLATIONS } from '../constants/pre-translations';
import { SupabaseService } from '../../../database/supabase.service';

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  constructor(
    private translationRepository: TranslationRepository,
    private geminiService: GeminiTranslationService,
    private supabaseService: SupabaseService,
  ) {}

  /**
   * Create translations for an entity field
   * - Detects language of input text
   * - Generates translations for tenant-enabled languages only
   * - Stores in database
   */
  async createTranslations(
    dto: CreateTranslationDto,
    userId?: string,
    tenantId?: string,
  ): Promise<{ sourceLanguage: string; translations: TranslationResult }> {
    try {
      // Step 1: Get supported languages first (for validation)
      const supportedLanguages = this.geminiService.getSupportedLanguages();
      const defaultLanguage = 'en'; // Default fallback language

      // Step 2: Detect source language if not provided
      let sourceLanguage = dto.sourceLanguage;
      if (!sourceLanguage) {
        const detection = await this.geminiService.detectLanguage(dto.text);
        const detectedLanguage = detection.language;
        
        // Normalize detected language to supported languages
        // If detected language is not supported, use default (en)
        if (supportedLanguages.includes(detectedLanguage)) {
          sourceLanguage = detectedLanguage;
        } else {
          sourceLanguage = defaultLanguage;
          this.logger.warn(
            `Detected language '${detectedLanguage}' is not supported, using default '${defaultLanguage}' for entity ${dto.entityType}:${dto.entityId}`,
          );
        }
        
        this.logger.log(
          `Detected language: ${detectedLanguage} (confidence: ${detection.confidence}), using: ${sourceLanguage} for entity ${dto.entityType}:${dto.entityId}`,
        );
      } else {
        // Validate provided source language
        if (!supportedLanguages.includes(sourceLanguage)) {
          this.logger.warn(
            `Provided source language '${sourceLanguage}' is not supported, using default '${defaultLanguage}' for entity ${dto.entityType}:${dto.entityId}`,
          );
          sourceLanguage = defaultLanguage;
        }
      }

      // Step 3: Get target languages - only tenant-enabled languages
      let targetLanguages: string[] = [];
      if (tenantId) {
        // Get tenant-enabled languages
        const tenantLanguages = await this.translationRepository.getTenantLanguages(tenantId);
        const enabledCodes = tenantLanguages.map(l => l.code);
        targetLanguages = enabledCodes.filter((lang) => lang !== sourceLanguage);
      } else {
        // Fallback: if no tenantId provided, use all supported languages (for backward compatibility)
        targetLanguages =
          dto.targetLanguages && dto.targetLanguages.length > 0
            ? dto.targetLanguages
            : supportedLanguages.filter((lang) => lang !== sourceLanguage);
      }

      if (targetLanguages.length === 0) {
        this.logger.warn('No target languages to translate to');
        return { sourceLanguage, translations: {} };
      }

      // Step 4: Generate translations using AI
      let translations: TranslationResult = {};
      try {
        translations = await this.geminiService.translateText(
          dto.text,
          targetLanguages,
          sourceLanguage,
        );
        this.logger.log(
          `Generated ${Object.keys(translations).length} translations for ${dto.entityType}:${dto.entityId}`,
        );
      } catch (error) {
        this.logger.error(`AI translation failed: ${error.message}`);
        // Continue with storing source text even if translation fails
        translations[sourceLanguage] = dto.text;
      }

      // Step 5: Create or get translation metadata
      // sourceLanguage is now guaranteed to be a supported language
      const metadata = await this.translationRepository.createOrGetMetadata(
        dto.entityType,
        dto.entityId,
        sourceLanguage,
      );

      // Step 6: Store source text and translations
      const allTranslations: TranslationResult = {
        [sourceLanguage]: dto.text,
        ...translations,
      };

      for (const [languageCode, translatedText] of Object.entries(allTranslations)) {
        if (translatedText && translatedText.trim()) {
          const isAiGenerated = languageCode !== sourceLanguage;
          await this.translationRepository.upsertTranslation(
            metadata.id,
            languageCode,
            dto.fieldName,
            translatedText,
            isAiGenerated,
            languageCode === sourceLanguage ? userId : undefined,
          );
        }
      }

      return { sourceLanguage, translations: allTranslations };
    } catch (error) {
      this.logger.error(`Failed to create translations: ${error.message}`, error.stack);
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to create translations: ${error.message}`);
    }
  }

  /**
   * Create translations for multiple fields of an entity in a single batch
   * More efficient than calling createTranslations multiple times
   * - Detects language once (using first field or combined text)
   * - Generates translations for all fields in parallel
   * - Stores in database
   */
  async createBatchTranslations(
    entityType: EntityType | string,
    entityId: string,
    fields: Array<{ fieldName: FieldName | string; text: string }>,
    userId?: string,
    tenantId?: string,
    sourceLanguage?: string,
  ): Promise<{ sourceLanguage: string; translations: { [fieldName: string]: TranslationResult } }> {
    if (!fields || fields.length === 0) {
      return { sourceLanguage: sourceLanguage || 'en', translations: {} };
    }

    try {
      // Step 1: Get supported languages first (for validation)
      const supportedLanguages = this.geminiService.getSupportedLanguages();
      const defaultLanguage = 'en';

      // Step 2: Detect source language if not provided
      // Use the first non-empty field for detection, or combine all texts
      let detectedSourceLanguage = sourceLanguage;
      if (!detectedSourceLanguage) {
        const textForDetection = fields.find(f => f.text && f.text.trim())?.text || fields[0]?.text || '';
        if (textForDetection) {
          const detection = await this.geminiService.detectLanguage(textForDetection);
          const detectedLanguage = detection.language;
          
          if (supportedLanguages.includes(detectedLanguage)) {
            detectedSourceLanguage = detectedLanguage;
          } else {
            detectedSourceLanguage = defaultLanguage;
            this.logger.warn(
              `Detected language '${detectedLanguage}' is not supported, using default '${defaultLanguage}' for entity ${entityType}:${entityId}`,
            );
          }
          
          this.logger.log(
            `Detected language: ${detectedLanguage} (confidence: ${detection.confidence}), using: ${detectedSourceLanguage} for entity ${entityType}:${entityId}`,
          );
        } else {
          detectedSourceLanguage = defaultLanguage;
        }
      } else {
        // Validate provided source language
        if (!supportedLanguages.includes(detectedSourceLanguage)) {
          this.logger.warn(
            `Provided source language '${detectedSourceLanguage}' is not supported, using default '${defaultLanguage}' for entity ${entityType}:${entityId}`,
          );
          detectedSourceLanguage = defaultLanguage;
        }
      }

      // Step 3: Get target languages - only tenant-enabled languages
      let targetLanguages: string[] = [];
      if (tenantId) {
        const tenantLanguages = await this.translationRepository.getTenantLanguages(tenantId);
        const enabledCodes = tenantLanguages.map(l => l.code);
        targetLanguages = enabledCodes.filter((lang) => lang !== detectedSourceLanguage);
      } else {
        targetLanguages = supportedLanguages.filter((lang) => lang !== detectedSourceLanguage);
      }

      if (targetLanguages.length === 0) {
        this.logger.warn('No target languages to translate to');
        return { sourceLanguage: detectedSourceLanguage, translations: {} };
      }

      // Step 4: Batch translate all fields using the batch translation method
      const textsToTranslate = fields
        .filter(f => f.text && f.text.trim())
        .map(f => ({ text: f.text, fieldName: f.fieldName }));

      const batchResults: Array<{ fieldName: string; translations: TranslationResult }> = [];
      
      if (textsToTranslate.length > 0) {
        try {
          const batchTranslations = await this.geminiService.translateBatch(
            textsToTranslate,
            targetLanguages,
            detectedSourceLanguage,
          );
          batchResults.push(...batchTranslations);
          
          this.logger.log(
            `Generated batch translations for ${batchResults.length} fields of ${entityType}:${entityId}`,
          );
        } catch (error) {
          this.logger.error(`AI batch translation failed: ${error.message}`);
          // Continue with storing source text even if translation fails
        }
      }

      // Step 5: Create or get translation metadata (once for all fields)
      const metadata = await this.translationRepository.createOrGetMetadata(
        entityType,
        entityId,
        detectedSourceLanguage,
      );

      // Step 6: Store source text and translations for all fields
      const allTranslations: { [fieldName: string]: TranslationResult } = {};

      for (const field of fields) {
        if (!field.text || !field.text.trim()) continue;

        const fieldResult = batchResults.find(r => r.fieldName === field.fieldName);
        const translations: TranslationResult = fieldResult?.translations || {};

        // Include source language text
        const allFieldTranslations: TranslationResult = {
          [detectedSourceLanguage]: field.text,
          ...translations,
        };

        allTranslations[field.fieldName] = allFieldTranslations;

        // Store each translation in database
        for (const [languageCode, translatedText] of Object.entries(allFieldTranslations)) {
          if (translatedText && translatedText.trim()) {
            const isAiGenerated = languageCode !== detectedSourceLanguage;
            await this.translationRepository.upsertTranslation(
              metadata.id,
              languageCode,
              field.fieldName,
              translatedText,
              isAiGenerated,
              languageCode === detectedSourceLanguage ? userId : undefined,
            );
          }
        }
      }

      return { sourceLanguage: detectedSourceLanguage, translations: allTranslations };
    } catch (error) {
      this.logger.error(`Failed to create batch translations: ${error.message}`, error.stack);
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to create batch translations: ${error.message}`);
    }
  }

  /**
   * Insert translations directly without AI translation
   * Used for standard data that doesn't need translation (categories, menu items, etc.)
   * Uses pre-translated data from PRE_TRANSLATIONS constant
   * Only inserts translations for tenant-enabled languages
   */
  async insertTranslationsDirectly(
    dto: CreateTranslationDto,
    userId?: string,
    tenantId?: string,
  ): Promise<void> {
    try {
      const sourceLanguage = dto.sourceLanguage || 'en';
      
      // Get tenant-enabled languages (default to English only if no tenantId)
      let enabledLanguages: string[] = ['en']; // Always include English
      if (tenantId) {
        const tenantLanguages = await this.translationRepository.getTenantLanguages(tenantId);
        enabledLanguages = tenantLanguages.map(l => l.code);
      }

      // Get pre-translated data if available, otherwise use the same text for all languages
      const preTranslation = PRE_TRANSLATIONS[dto.text];
      const translations: TranslationResult = {};

      if (preTranslation) {
        // Use pre-translated data only for enabled languages
        for (const lang of enabledLanguages) {
          translations[lang] = preTranslation[lang as keyof typeof preTranslation] || dto.text;
        }
      } else {
        // Fallback: use the same text for enabled languages
        for (const lang of enabledLanguages) {
          translations[lang] = dto.text;
        }
      }

      // Create or get translation metadata
      const metadata = await this.translationRepository.createOrGetMetadata(
        dto.entityType,
        dto.entityId,
        sourceLanguage,
      );

      // Insert translations only for tenant-enabled languages
      for (const languageCode of enabledLanguages) {
        const translatedText = translations[languageCode] || dto.text;
        await this.translationRepository.upsertTranslation(
          metadata.id,
          languageCode,
          dto.fieldName,
          translatedText,
          false, // Not AI-generated (pre-translated)
          languageCode === sourceLanguage ? userId : undefined,
        );
      }

      this.logger.log(
        `Inserted direct translations for ${dto.entityType}:${dto.entityId} (${dto.fieldName})`,
      );
    } catch (error) {
      this.logger.error(`Failed to insert direct translations: ${error.message}`, error.stack);
      // Don't throw - this is for non-critical standard data
    }
  }

  /**
   * Bulk insert translations directly (optimized for seed data)
   * Inserts multiple translations in a single batch operation
   * Only inserts for tenant-enabled languages
   */
  async bulkInsertTranslationsDirectly(
    translations: Array<{
      entityType: EntityType | string;
      entityId: string;
      fieldName: FieldName | string;
      text: string;
    }>,
    tenantId?: string,
  ): Promise<void> {
    try {
      // Get supabase client directly
      const supabase = this.supabaseService.getServiceRoleClient();
      
      // Get tenant-enabled languages (default to English only if no tenantId)
      let enabledLanguages: string[] = ['en']; // Always include English
      if (tenantId) {
        const tenantLanguages = await this.translationRepository.getTenantLanguages(tenantId);
        enabledLanguages = tenantLanguages.map(l => l.code);
      }
      
      const sourceLanguage = 'en';

      // Prepare all metadata entries (deduplicate by entityType:entityId)
      const metadataMap = new Map<string, { entity_type: string; entity_id: string; source_language: string }>();
      for (const trans of translations) {
        const key = `${trans.entityType}:${trans.entityId}`;
        if (!metadataMap.has(key)) {
          metadataMap.set(key, {
            entity_type: trans.entityType,
            entity_id: trans.entityId,
            source_language: sourceLanguage,
          });
        }
      }
      const metadataEntries = Array.from(metadataMap.values());

      // Bulk insert metadata (with conflict handling)
      const { data: metadataResults, error: metadataError } = await supabase
        .from('translation_metadata')
        .upsert(metadataEntries, {
          onConflict: 'entity_type,entity_id',
          ignoreDuplicates: false,
        })
        .select('id, entity_type, entity_id');

      if (metadataError) {
        this.logger.error(`Failed to bulk insert translation metadata: ${metadataError.message}`);
        return;
      }

      // Create a map of entity to metadata ID
      const entityToMetadataMap = new Map<string, string>();
      for (const meta of metadataResults || []) {
        const key = `${meta.entity_type}:${meta.entity_id}`;
        entityToMetadataMap.set(key, meta.id);
      }

      // Prepare all translation entries
      const translationEntries: any[] = [];
      for (const trans of translations) {
        const key = `${trans.entityType}:${trans.entityId}`;
        const metadataId = entityToMetadataMap.get(key);
        if (!metadataId) continue;

        const preTranslation = PRE_TRANSLATIONS[trans.text];
        const texts: TranslationResult = {};

        if (preTranslation) {
          // Only use pre-translations for enabled languages
          for (const lang of enabledLanguages) {
            texts[lang] = preTranslation[lang as keyof typeof preTranslation] || trans.text;
          }
        } else {
          // Use same text for enabled languages
          for (const lang of enabledLanguages) {
            texts[lang] = trans.text;
          }
        }

        // Only insert for tenant-enabled languages
        for (const languageCode of enabledLanguages) {
          translationEntries.push({
            metadata_id: metadataId,
            language_code: languageCode,
            field_name: trans.fieldName,
            translated_text: texts[languageCode] || trans.text,
            is_ai_generated: false,
          });
        }
      }

      // Bulk insert translations in batches (Supabase has limits)
      const batchSize = 1000;
      for (let i = 0; i < translationEntries.length; i += batchSize) {
        const batch = translationEntries.slice(i, i + batchSize);
        const { error: translationError } = await supabase
          .from('translations')
          .upsert(batch, {
            onConflict: 'metadata_id,language_code,field_name',
          });

        if (translationError) {
          this.logger.error(`Failed to bulk insert translations batch ${i / batchSize + 1}: ${translationError.message}`);
        }
      }

      this.logger.log(`Bulk inserted ${translationEntries.length} translations for ${translations.length} entities`);
    } catch (error) {
      this.logger.error(`Failed to bulk insert translations: ${error.message}`, error.stack);
      // Don't throw - this is for non-critical standard data
    }
  }

  /**
   * Update a specific translation (typically for manual edits)
   */
  async updateTranslation(dto: UpdateTranslationDto, userId?: string): Promise<void> {
    try {
      // Get metadata
      const metadata = await this.translationRepository.createOrGetMetadata(
        dto.entityType,
        dto.entityId,
        '', // Source language not needed for updates
      );

      // Update translation
      await this.translationRepository.upsertTranslation(
        metadata.id,
        dto.languageCode,
        dto.fieldName,
        dto.translatedText,
        dto.isAiGenerated !== undefined ? dto.isAiGenerated : false,
        userId,
      );

      this.logger.log(
        `Updated translation for ${dto.entityType}:${dto.entityId} (${dto.languageCode}:${dto.fieldName})`,
      );
    } catch (error) {
      this.logger.error(`Failed to update translation: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to update translation: ${error.message}`);
    }
  }

  /**
   * Get translation for an entity field in a specific language
   */
  async getTranslation(dto: GetTranslationDto): Promise<string | null> {
    try {
      const fallbackLanguage = dto.fallbackLanguage || 'en';
      return await this.translationRepository.getTranslation(
        dto.entityType,
        dto.entityId,
        dto.languageCode,
        dto.fieldName,
        fallbackLanguage,
      );
    } catch (error) {
      this.logger.error(`Failed to get translation: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to get translation: ${error.message}`);
    }
  }

  /**
   * Get all translations for an entity
   */
  async getEntityTranslations(
    entityType: EntityType,
    entityId: string,
  ): Promise<{ [fieldName: string]: { [languageCode: string]: string } }> {
    try {
      const translations = await this.translationRepository.getEntityTranslations(
        entityType,
        entityId,
      );

      // Organize by field name and language
      const organized: { [fieldName: string]: { [languageCode: string]: string } } = {};

      for (const translation of translations) {
        if (!organized[translation.fieldName]) {
          organized[translation.fieldName] = {};
        }
        organized[translation.fieldName][translation.languageCode] = translation.translatedText;
      }

      return organized;
    } catch (error) {
      this.logger.error(`Failed to get entity translations: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to get entity translations: ${error.message}`,
      );
    }
  }

  /**
   * Get supported languages
   */
  async getSupportedLanguages(activeOnly = true) {
    return this.translationRepository.getSupportedLanguages(activeOnly);
  }

  /**
   * Get default language
   */
  async getDefaultLanguage() {
    return this.translationRepository.getDefaultLanguage();
  }

  /**
   * Get enabled languages for a tenant
   */
  async getTenantLanguages(tenantId: string) {
    return this.translationRepository.getTenantLanguages(tenantId);
  }

  /**
   * Get available languages that can be added for a tenant
   */
  async getAvailableLanguagesForTenant(tenantId: string) {
    return this.translationRepository.getAvailableLanguagesForTenant(tenantId);
  }

  /**
   * Delete all translations for an entity (used when entity is deleted)
   */
  async deleteEntityTranslations(entityType: EntityType | string, entityId: string): Promise<void> {
    try {
      // Convert string to EntityType enum if it's a valid enum value
      const enumValue = typeof entityType === 'string' ? (entityType as EntityType) : entityType;
      await this.translationRepository.deleteEntityTranslations(enumValue as EntityType, entityId);
      this.logger.log(`Deleted translations for ${entityType}:${entityId}`);
    } catch (error) {
      this.logger.error(`Failed to delete entity translations: ${error.message}`, error.stack);
      throw new InternalServerErrorException(
        `Failed to delete entity translations: ${error.message}`,
      );
    }
  }

  /**
   * Create a new supported language (Admin only)
   */
  async createLanguage(dto: CreateLanguageDto) {
    try {
      // Check if language code already exists
      const existing = await this.translationRepository.getSupportedLanguages(false);
      if (existing.some((lang) => lang.code === dto.code)) {
        throw new BadRequestException(`Language with code '${dto.code}' already exists`);
      }

      const language = await this.translationRepository.createLanguage({
        code: dto.code,
        name: dto.name,
        nativeName: dto.nativeName,
        rtl: dto.rtl || false,
        isDefault: dto.isDefault || false,
      });

      this.logger.log(`Created new language: ${dto.code} (${dto.name})`);
      return language;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Failed to create language: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to create language: ${error.message}`);
    }
  }

  /**
   * Update a supported language (Admin only)
   */
  async updateLanguage(code: string, dto: UpdateLanguageDto) {
    try {
      const language = await this.translationRepository.updateLanguage(code, {
        name: dto.name,
        nativeName: dto.nativeName,
        rtl: dto.rtl,
        isActive: dto.isActive,
        isDefault: dto.isDefault,
      });

      this.logger.log(`Updated language: ${code}`);
      return language;
    } catch (error) {
      this.logger.error(`Failed to update language: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to update language: ${error.message}`);
    }
  }

  /**
   * Delete a language (soft delete - Admin only)
   */
  async deleteLanguage(code: string) {
    try {
      await this.translationRepository.deleteLanguage(code);
      this.logger.log(`Deleted language: ${code}`);
      return { message: `Language ${code} deleted successfully` };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Failed to delete language: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to delete language: ${error.message}`);
    }
  }

  /**
   * Enable a language for a tenant and translate all existing data
   */
  async enableLanguageForTenant(
    tenantId: string,
    languageCode: string,
    userId?: string,
  ): Promise<{ message: string }> {
    try {
      // Enable language for tenant
      await this.translationRepository.enableLanguageForTenant(tenantId, languageCode);
      this.logger.log(`Enabled language ${languageCode} for tenant ${tenantId}`);

      // Start translation in background (fire and forget)
      this.translateExistingDataForLanguage(tenantId, languageCode, userId).catch((error) => {
        this.logger.error(
          `Background translation failed for ${languageCode} (tenant ${tenantId}): ${error.message}`,
          error.stack,
        );
      });

      return {
        message: `Language ${languageCode} enabled successfully. Translations are being processed in the background and may take a while to complete.`,
      };
    } catch (error) {
      this.logger.error(`Failed to enable language for tenant: ${error.message}`, error.stack);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to enable language for tenant: ${error.message}`);
    }
  }

  /**
   * Private method to translate existing data for a newly enabled language (runs in background)
   */
  private async translateExistingDataForLanguage(
    tenantId: string,
    languageCode: string,
    userId?: string,
  ): Promise<void> {
    try {
      // Get all translation metadata for this tenant's entities
      // We need to translate all existing entities
      const supabase = this.supabaseService.getServiceRoleClient();
      
      // Get all entity types that might have translations
      const entityTypes = [
        'category',
        'food_item',
        'addon_group',
        'addon',
        'variation_group',
        'variation',
        'buffet',
        'combo_meal',
        'menu',
        'branch',
        'ingredient',
        'restaurant',
        'user',
        'employee', // Also handle 'employee' entity type (same as 'user', stored in users table)
      ];

      let totalEntitiesTranslated = 0;

      this.logger.log(`Starting translation of existing data to ${languageCode} for tenant ${tenantId}`);

      // For each entity type, get all entities for this tenant and translate them
      for (const entityType of entityTypes) {
        try {
          this.logger.debug(`Processing entity type: ${entityType}`);
          // Get all entities of this type for the tenant
          let entities: any[] = [];
          
          // Map entity types to their table names
          const tableMap: Record<string, string> = {
            category: 'categories',
            food_item: 'food_items',
            addon_group: 'add_on_groups',
            addon: 'add_ons',
            variation_group: 'variation_groups',
            variation: 'variations',
            buffet: 'buffets',
            combo_meal: 'combo_meals',
            menu: 'menus',
            branch: 'branches',
            ingredient: 'ingredients',
            restaurant: 'tenants',
            user: 'users',
            employee: 'users', // Employee entity type also uses 'users' table
          };

          const tableName = tableMap[entityType];
          if (!tableName) continue;

          // Query entities for this tenant
          if (entityType === 'restaurant') {
            // For restaurant, check if it's the tenant itself
            const { data } = await supabase
              .from(tableName)
              .select('id')
              .eq('id', tenantId)
              .maybeSingle();
            if (data) entities = [data];
          } else if (entityType === 'addon') {
            // For addons, join with addon_groups to get tenant_id
            const { data } = await supabase
              .from(tableName)
              .select('id, add_on_group:add_on_groups!inner(tenant_id)')
              .eq('add_on_group.tenant_id', tenantId);
            if (data) entities = data.map((e: any) => ({ id: e.id }));
          } else if (entityType === 'variation') {
            // For variations, join with variation_groups to get tenant_id
            const { data } = await supabase
              .from(tableName)
              .select('id, variation_group:variation_groups!inner(tenant_id)')
              .eq('variation_group.tenant_id', tenantId);
            if (data) entities = data.map((e: any) => ({ id: e.id }));
          } else {
            // Standard entities with tenant_id
            const { data } = await supabase
              .from(tableName)
              .select('id')
              .eq('tenant_id', tenantId);
            if (data) entities = data;
          }

          // Translate each entity
          for (const entity of entities) {
            try {
              // Get existing translations for this entity
              const existingTranslations = await this.translationRepository.getEntityTranslations(
                entityType as any,
                entity.id,
              );

              // Check if translation already exists for this language
              const existingForLang = existingTranslations.find((t) => t.languageCode === languageCode);
              if (existingForLang) continue; // Already translated

              let fieldsToTranslate: Map<string, string> = new Map();

              if (existingTranslations.length > 0) {
                // Use existing translations as source
                const fieldsByLang = new Map<string, Map<string, string>>();
                for (const trans of existingTranslations) {
                  if (!fieldsByLang.has(trans.languageCode)) {
                    fieldsByLang.set(trans.languageCode, new Map());
                  }
                  fieldsByLang.get(trans.languageCode)!.set(trans.fieldName, trans.translatedText);
                }

                // Get English translations (or first available language)
                const sourceLang = fieldsByLang.has('en') ? 'en' : Array.from(fieldsByLang.keys())[0];
                const sourceFields = fieldsByLang.get(sourceLang);
                if (sourceFields) {
                  fieldsToTranslate = sourceFields;
                }
              } else {
                // No translation metadata exists - fetch entity from database and use its fields
                let entityData: any = null;
                
                // Fetch full entity data based on type
                if (entityType === 'category') {
                  const { data } = await supabase.from('categories').select('name, description').eq('id', entity.id).eq('tenant_id', tenantId).single();
                  entityData = data;
                  if (entityData?.name) fieldsToTranslate.set('name', entityData.name);
                  if (entityData?.description) fieldsToTranslate.set('description', entityData.description);
                } else if (entityType === 'food_item') {
                  const { data } = await supabase.from('food_items').select('name, description').eq('id', entity.id).eq('tenant_id', tenantId).single();
                  entityData = data;
                  if (entityData?.name) fieldsToTranslate.set('name', entityData.name);
                  if (entityData?.description) fieldsToTranslate.set('description', entityData.description);
                } else if (entityType === 'addon_group') {
                  const { data } = await supabase.from('add_on_groups').select('name').eq('id', entity.id).eq('tenant_id', tenantId).single();
                  entityData = data;
                  if (entityData?.name) fieldsToTranslate.set('name', entityData.name);
                } else if (entityType === 'addon') {
                  // Addons don't have tenant_id directly, need to join with add_on_groups
                  const { data } = await supabase
                    .from('add_ons')
                    .select('name, add_on_group:add_on_groups!inner(tenant_id)')
                    .eq('id', entity.id)
                    .eq('add_on_group.tenant_id', tenantId)
                    .single();
                  entityData = data;
                  if (entityData?.name) fieldsToTranslate.set('name', entityData.name);
                } else if (entityType === 'variation_group') {
                  const { data } = await supabase.from('variation_groups').select('name').eq('id', entity.id).eq('tenant_id', tenantId).single();
                  entityData = data;
                  if (entityData?.name) fieldsToTranslate.set('name', entityData.name);
                } else if (entityType === 'variation') {
                  // Variations don't have tenant_id directly, need to join with variation_groups
                  const { data } = await supabase
                    .from('variations')
                    .select('name, variation_group:variation_groups!inner(tenant_id)')
                    .eq('id', entity.id)
                    .eq('variation_group.tenant_id', tenantId)
                    .single();
                  entityData = data;
                  if (entityData?.name) fieldsToTranslate.set('name', entityData.name);
                } else if (entityType === 'buffet') {
                  const { data } = await supabase.from('buffets').select('name, description').eq('id', entity.id).eq('tenant_id', tenantId).single();
                  entityData = data;
                  if (entityData?.name) fieldsToTranslate.set('name', entityData.name);
                  if (entityData?.description) fieldsToTranslate.set('description', entityData.description);
                } else if (entityType === 'combo_meal') {
                  const { data } = await supabase.from('combo_meals').select('name, description').eq('id', entity.id).eq('tenant_id', tenantId).single();
                  entityData = data;
                  if (entityData?.name) fieldsToTranslate.set('name', entityData.name);
                  if (entityData?.description) fieldsToTranslate.set('description', entityData.description);
                } else if (entityType === 'menu') {
                  const { data } = await supabase.from('menus').select('name').eq('id', entity.id).eq('tenant_id', tenantId).single();
                  entityData = data;
                  if (entityData?.name) fieldsToTranslate.set('name', entityData.name);
                } else if (entityType === 'branch') {
                  const { data } = await supabase.from('branches').select('name, city, address').eq('id', entity.id).eq('tenant_id', tenantId).single();
                  entityData = data;
                  if (entityData?.name) fieldsToTranslate.set('name', entityData.name);
                  if (entityData?.city) fieldsToTranslate.set('city', entityData.city);
                  if (entityData?.address) fieldsToTranslate.set('address', entityData.address);
                } else if (entityType === 'ingredient') {
                  const { data } = await supabase.from('ingredients').select('name, storage_location').eq('id', entity.id).eq('tenant_id', tenantId).single();
                  entityData = data;
                  if (entityData?.name) fieldsToTranslate.set('name', entityData.name);
                  if (entityData?.storage_location) fieldsToTranslate.set('storage_location', entityData.storage_location);
                } else if (entityType === 'restaurant') {
                  const { data } = await supabase.from('tenants').select('name').eq('id', entity.id).single();
                  entityData = data;
                  if (entityData?.name) fieldsToTranslate.set('name', entityData.name);
                } else if (entityType === 'user' || entityType === 'employee') {
                  // Users/employees have a name field (both 'user' and 'employee' entity types use 'users' table)
                  const { data } = await supabase.from('users').select('name').eq('id', entity.id).eq('tenant_id', tenantId).single();
                  entityData = data;
                  if (entityData?.name) fieldsToTranslate.set('name', entityData.name);
                }
              }

              if (fieldsToTranslate.size === 0) continue; // No fields to translate

              // Get or create metadata (use 'en' as source language)
              const metadata = await this.translationRepository.createOrGetMetadata(
                entityType,
                entity.id,
                'en', // Assume English as source
              );

              // Translate each field
              for (const [fieldName, sourceText] of fieldsToTranslate.entries()) {
                if (!sourceText || sourceText.trim() === '') continue;
                
                try {
                  // Generate translation
                  const translated = await this.geminiService.translateText(
                    sourceText,
                    [languageCode],
                    'en', // Source language
                  );

                  if (translated[languageCode]) {
                    // Store translation
                    await this.translationRepository.upsertTranslation(
                      metadata.id,
                      languageCode,
                      fieldName,
                      translated[languageCode],
                      true, // AI-generated
                      userId,
                    );
                  }
                } catch (fieldError) {
                  this.logger.warn(
                    `Failed to translate ${entityType}:${entity.id} field ${fieldName} to ${languageCode}: ${fieldError.message}`,
                  );
                }
              }

              totalEntitiesTranslated++;
            } catch (entityError) {
              this.logger.warn(
                `Failed to translate ${entityType}:${entity.id} to ${languageCode}: ${entityError.message}`,
              );
            }
          }
          
          this.logger.debug(`Completed processing ${entityType}, translated ${entities.length} entities`);
        } catch (typeError) {
          this.logger.warn(`Failed to process entity type ${entityType}: ${typeError.message}`);
        }
      }

      this.logger.log(
        `Completed translating ${totalEntitiesTranslated} entities to ${languageCode} for tenant ${tenantId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to translate existing data: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Re-translate an entity's translations (Admin only)
   * Regenerates translations using the source language text
   */
  async retranslate(dto: RetranslateDto, userId?: string) {
    try {
      // Get translation metadata
      const metadata = await this.translationRepository.getTranslationMetadata(
        dto.entityType as EntityType,
        dto.entityId,
      );

      if (!metadata) {
        throw new NotFoundException(
          `No translation metadata found for ${dto.entityType}:${dto.entityId}`,
        );
      }

      // Get all existing translations to find source text
      const allTranslations = await this.translationRepository.getEntityTranslations(
        dto.entityType as EntityType,
        dto.entityId,
      );

      // Get source language translation (or English as fallback)
      const sourceTranslation = allTranslations.find(
        (t) => t.languageCode === metadata.sourceLanguage,
      ) || allTranslations.find((t) => t.languageCode === 'en');

      if (!sourceTranslation) {
        throw new NotFoundException('No source translation found for re-translation');
      }

      // Get target languages
      const supportedLanguages = this.geminiService.getSupportedLanguages();
      const targetLanguages =
        dto.targetLanguages && dto.targetLanguages.length > 0
          ? dto.targetLanguages.filter((lang) => lang !== metadata.sourceLanguage)
          : supportedLanguages.filter((lang) => lang !== metadata.sourceLanguage);

      if (targetLanguages.length === 0) {
        throw new BadRequestException('No target languages specified');
      }

      // Re-translate each field
      const fieldGroups = new Map<string, string>();
      for (const translation of allTranslations) {
        if (translation.languageCode === metadata.sourceLanguage || translation.languageCode === 'en') {
          const key = translation.fieldName;
          if (!fieldGroups.has(key) || translation.languageCode === metadata.sourceLanguage) {
            fieldGroups.set(key, translation.translatedText);
          }
        }
      }

      const results: TranslationResult[] = [];
      for (const [fieldName, sourceText] of fieldGroups.entries()) {
        // Generate new translations
        const newTranslations = await this.geminiService.translateText(
          sourceText,
          targetLanguages,
          metadata.sourceLanguage,
        );

        // Update translations in database
        for (const [languageCode, translatedText] of Object.entries(newTranslations)) {
          await this.translationRepository.upsertTranslation(
            metadata.id,
            languageCode,
            fieldName,
            translatedText,
            true, // isAiGenerated
            userId,
          );
        }

        results.push(newTranslations);
      }

      this.logger.log(
        `Re-translated ${dto.entityType}:${dto.entityId} for languages: ${targetLanguages.join(', ')}`,
      );

      return {
        message: 'Translations regenerated successfully',
        targetLanguages,
        fieldsTranslated: Array.from(fieldGroups.keys()),
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Failed to re-translate: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to re-translate: ${error.message}`);
    }
  }
}

