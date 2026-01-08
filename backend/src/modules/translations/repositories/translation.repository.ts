import { Injectable, Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../../database/supabase.service';
import { EntityType, FieldName } from '../dto/create-translation.dto';

export interface TranslationMetadata {
  id: string;
  entityType: string;
  entityId: string;
  sourceLanguage: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Translation {
  id: string;
  metadataId: string;
  languageCode: string;
  fieldName: string;
  translatedText: string;
  isAiGenerated: boolean;
  lastUpdatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  isActive: boolean;
  isDefault: boolean;
  rtl: boolean;
}

@Injectable()
export class TranslationRepository {
  private readonly logger = new Logger(TranslationRepository.name);

  constructor(private supabaseService: SupabaseService) {}

  /**
   * Get all supported languages
   */
  async getSupportedLanguages(activeOnly = true): Promise<SupportedLanguage[]> {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    let query = supabase
      .from('supported_languages')
      .select('*')
      .order('code', { ascending: true });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error(`Failed to fetch supported languages: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch supported languages');
    }

    return (data || []).map((lang: any) => ({
      code: lang.code,
      name: lang.name,
      nativeName: lang.native_name,
      isActive: lang.is_active,
      isDefault: lang.is_default,
      rtl: lang.rtl,
    }));
  }

  /**
   * Create a new supported language
   */
  async createLanguage(language: {
    code: string;
    name: string;
    nativeName: string;
    rtl?: boolean;
    isDefault?: boolean;
  }): Promise<SupportedLanguage> {
    const supabase = this.supabaseService.getServiceRoleClient();

    // If setting as default, unset other defaults
    if (language.isDefault) {
      await supabase
        .from('supported_languages')
        .update({ is_default: false })
        .eq('is_default', true);
    }

    const { data, error } = await supabase
      .from('supported_languages')
      .insert({
        code: language.code,
        name: language.name,
        native_name: language.nativeName,
        rtl: language.rtl || false,
        is_default: language.isDefault || false,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create language: ${error.message}`);
      throw new InternalServerErrorException('Failed to create language');
    }

    return {
      code: data.code,
      name: data.name,
      nativeName: data.native_name,
      isActive: data.is_active,
      isDefault: data.is_default,
      rtl: data.rtl,
    };
  }

  /**
   * Update a supported language
   */
  async updateLanguage(
    code: string,
    updates: {
      name?: string;
      nativeName?: string;
      rtl?: boolean;
      isActive?: boolean;
      isDefault?: boolean;
    },
  ): Promise<SupportedLanguage> {
    const supabase = this.supabaseService.getServiceRoleClient();

    // If setting as default, unset other defaults
    if (updates.isDefault) {
      await supabase
        .from('supported_languages')
        .update({ is_default: false })
        .eq('is_default', true)
        .neq('code', code);
    }

    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.nativeName !== undefined) updateData.native_name = updates.nativeName;
    if (updates.rtl !== undefined) updateData.rtl = updates.rtl;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
    if (updates.isDefault !== undefined) updateData.is_default = updates.isDefault;

    const { data, error } = await supabase
      .from('supported_languages')
      .update(updateData)
      .eq('code', code)
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to update language: ${error.message}`);
      throw new InternalServerErrorException('Failed to update language');
    }

    return {
      code: data.code,
      name: data.name,
      nativeName: data.native_name,
      isActive: data.is_active,
      isDefault: data.is_default,
      rtl: data.rtl,
    };
  }

  /**
   * Delete a language (soft delete by setting is_active = false)
   */
  async deleteLanguage(code: string): Promise<void> {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Don't allow deleting default language
    const { data: lang } = await supabase
      .from('supported_languages')
      .select('is_default')
      .eq('code', code)
      .single();

    if (lang?.is_default) {
      throw new BadRequestException('Cannot delete the default language');
    }

    const { error } = await supabase
      .from('supported_languages')
      .update({ is_active: false })
      .eq('code', code);

    if (error) {
      this.logger.error(`Failed to delete language: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete language');
    }
  }

  /**
   * Get default language
   */
  async getDefaultLanguage(): Promise<SupportedLanguage | null> {
    const supabase = this.supabaseService.getServiceRoleClient();
    
    const { data, error } = await supabase
      .from('supported_languages')
      .select('*')
      .eq('is_default', true)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No default language found
        return null;
      }
      this.logger.error(`Failed to fetch default language: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch default language');
    }

    return {
      code: data.code,
      name: data.name,
      nativeName: data.native_name,
      isActive: data.is_active,
      isDefault: data.is_default,
      rtl: data.rtl,
    };
  }

  /**
   * Get translation metadata by entity type and ID
   */
  async getTranslationMetadata(
    entityType: EntityType | string,
    entityId: string,
  ): Promise<TranslationMetadata | null> {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data, error } = await supabase
      .from('translation_metadata')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      this.logger.error(`Failed to get translation metadata: ${error.message}`);
      throw new InternalServerErrorException('Failed to get translation metadata');
    }

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      entityType: data.entity_type,
      entityId: data.entity_id,
      sourceLanguage: data.source_language,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  /**
   * Create or get translation metadata
   */
  async createOrGetMetadata(
    entityType: EntityType | string,
    entityId: string,
    sourceLanguage: string,
  ): Promise<TranslationMetadata> {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Try to get existing metadata
    const { data: existing, error: fetchError } = await supabase
      .from('translation_metadata')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .single();

    if (existing && !fetchError) {
      return {
        id: existing.id,
        entityType: existing.entity_type,
        entityId: existing.entity_id,
        sourceLanguage: existing.source_language,
        createdAt: new Date(existing.created_at),
        updatedAt: new Date(existing.updated_at),
      };
    }

    // Create new metadata
    const { data, error } = await supabase
      .from('translation_metadata')
      .insert({
        entity_type: entityType,
        entity_id: entityId,
        source_language: sourceLanguage,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create translation metadata: ${error.message}`);
      throw new InternalServerErrorException('Failed to create translation metadata');
    }

    return {
      id: data.id,
      entityType: data.entity_type,
      entityId: data.entity_id,
      sourceLanguage: data.source_language,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  /**
   * Create or update translation
   */
  async upsertTranslation(
    metadataId: string,
    languageCode: string,
    fieldName: FieldName | string,
    translatedText: string,
    isAiGenerated = true,
    lastUpdatedBy?: string,
  ): Promise<Translation> {
    const supabase = this.supabaseService.getServiceRoleClient();

    const translationData: any = {
      metadata_id: metadataId,
      language_code: languageCode,
      field_name: fieldName,
      translated_text: translatedText,
      is_ai_generated: isAiGenerated,
    };

    if (lastUpdatedBy) {
      translationData.last_updated_by = lastUpdatedBy;
    }

    const { data, error } = await supabase
      .from('translations')
      .upsert(translationData, {
        onConflict: 'metadata_id,language_code,field_name',
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to upsert translation: ${error.message}`);
      throw new InternalServerErrorException('Failed to save translation');
    }

    return {
      id: data.id,
      metadataId: data.metadata_id,
      languageCode: data.language_code,
      fieldName: data.field_name,
      translatedText: data.translated_text,
      isAiGenerated: data.is_ai_generated,
      lastUpdatedBy: data.last_updated_by,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  /**
   * Get translation for an entity field in a specific language
   */
  async getTranslation(
    entityType: EntityType | string,
    entityId: string,
    languageCode: string,
    fieldName: FieldName | string,
    fallbackLanguage = 'en',
  ): Promise<string | null> {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Get metadata
    const { data: metadata, error: metadataError } = await supabase
      .from('translation_metadata')
      .select('id')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .single();

    if (!metadata || metadataError) {
      return null;
    }

    // Try requested language
    const { data: translation, error } = await supabase
      .from('translations')
      .select('translated_text')
      .eq('metadata_id', metadata.id)
      .eq('language_code', languageCode)
      .eq('field_name', fieldName)
      .single();

    if (translation && !error) {
      return translation.translated_text;
    }

    // Try fallback language
    if (fallbackLanguage !== languageCode) {
      const { data: fallbackTranslation, error: fallbackError } = await supabase
        .from('translations')
        .select('translated_text')
        .eq('metadata_id', metadata.id)
        .eq('language_code', fallbackLanguage)
        .eq('field_name', fieldName)
        .single();

      if (fallbackTranslation && !fallbackError) {
        return fallbackTranslation.translated_text;
      }
    }

    return null;
  }

  /**
   * Get all translations for an entity
   */
  async getEntityTranslations(
    entityType: EntityType,
    entityId: string,
  ): Promise<Translation[]> {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data: metadata, error: metadataError } = await supabase
      .from('translation_metadata')
      .select('id')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .single();

    if (!metadata || metadataError) {
      return [];
    }

    const { data, error } = await supabase
      .from('translations')
      .select('*')
      .eq('metadata_id', metadata.id)
      .order('language_code', { ascending: true });

    if (error) {
      this.logger.error(`Failed to fetch translations: ${error.message}`);
      throw new InternalServerErrorException('Failed to fetch translations');
    }

    return (data || []).map((t: any) => ({
      id: t.id,
      metadataId: t.metadata_id,
      languageCode: t.language_code,
      fieldName: t.field_name,
      translatedText: t.translated_text,
      isAiGenerated: t.is_ai_generated,
      lastUpdatedBy: t.last_updated_by,
      createdAt: new Date(t.created_at),
      updatedAt: new Date(t.updated_at),
    }));
  }

  /**
   * Delete all translations for an entity
   */
  async deleteEntityTranslations(entityType: EntityType | string, entityId: string): Promise<void> {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { error } = await supabase
      .from('translation_metadata')
      .delete()
      .eq('entity_type', entityType)
      .eq('entity_id', entityId);

    if (error) {
      this.logger.error(`Failed to delete translations: ${error.message}`);
      throw new InternalServerErrorException('Failed to delete translations');
    }
  }
}

