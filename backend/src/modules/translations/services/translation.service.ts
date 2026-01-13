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
   * - Generates translations for all supported languages
   * - Stores in database
   */
  async createTranslations(
    dto: CreateTranslationDto,
    userId?: string,
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

      // Step 3: Get target languages (default to all supported if not provided)
      const targetLanguages =
        dto.targetLanguages && dto.targetLanguages.length > 0
          ? dto.targetLanguages
          : supportedLanguages.filter((lang) => lang !== sourceLanguage);

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
   * Insert translations directly without AI translation
   * Used for standard data that doesn't need translation (categories, menu items, etc.)
   * Uses pre-translated data from PRE_TRANSLATIONS constant
   */
  async insertTranslationsDirectly(
    dto: CreateTranslationDto,
    userId?: string,
  ): Promise<void> {
    try {
      const sourceLanguage = dto.sourceLanguage || 'en';
      const supportedLanguages = this.geminiService.getSupportedLanguages();

      // Get pre-translated data if available, otherwise use the same text for all languages
      const preTranslation = PRE_TRANSLATIONS[dto.text];
      const translations: TranslationResult = {};

      if (preTranslation) {
        // Use pre-translated data
        translations.en = preTranslation.en;
        translations.ar = preTranslation.ar;
        translations.ku = preTranslation.ku;
        translations.fr = preTranslation.fr;
      } else {
        // Fallback: use the same text for all languages if no pre-translation exists
        for (const lang of supportedLanguages) {
          translations[lang] = dto.text;
        }
      }

      // Create or get translation metadata
      const metadata = await this.translationRepository.createOrGetMetadata(
        dto.entityType,
        dto.entityId,
        sourceLanguage,
      );

      // Insert translations for all supported languages
      for (const languageCode of supportedLanguages) {
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
   */
  async bulkInsertTranslationsDirectly(
    translations: Array<{
      entityType: EntityType | string;
      entityId: string;
      fieldName: FieldName | string;
      text: string;
    }>,
  ): Promise<void> {
    try {
      // Get supabase client directly
      const supabase = this.supabaseService.getServiceRoleClient();
      const supportedLanguages = this.geminiService.getSupportedLanguages();
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
          texts.en = preTranslation.en;
          texts.ar = preTranslation.ar;
          texts.ku = preTranslation.ku;
          texts.fr = preTranslation.fr;
        } else {
          for (const lang of supportedLanguages) {
            texts[lang] = trans.text;
          }
        }

        for (const languageCode of supportedLanguages) {
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

