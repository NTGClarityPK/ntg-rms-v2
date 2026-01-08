import apiClient from './client';

// Types
export type EntityType =
  | 'ingredient'
  | 'category'
  | 'food_item'
  | 'addon'
  | 'addon_group'
  | 'variation'
  | 'variation_group'
  | 'buffet'
  | 'combo_meal'
  | 'menu';

export type FieldName = 'name' | 'description' | 'title' | 'label' | 'short_description' | 'long_description';

export interface CreateTranslationRequest {
  entityType: EntityType;
  entityId: string;
  fieldName: FieldName;
  text: string;
  sourceLanguage?: string;
  targetLanguages?: string[];
}

export interface UpdateTranslationRequest {
  entityType: EntityType;
  entityId: string;
  languageCode: string;
  fieldName: FieldName;
  translatedText: string;
  isAiGenerated?: boolean;
}

export interface GetTranslationRequest {
  entityType: EntityType;
  entityId: string;
  languageCode: string;
  fieldName: FieldName;
  fallbackLanguage?: string;
}

export interface TranslationResponse {
  sourceLanguage: string;
  translations: { [languageCode: string]: string };
}

export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  isActive: boolean;
  isDefault: boolean;
  rtl: boolean;
}

export interface EntityTranslations {
  [fieldName: string]: { [languageCode: string]: string };
}

// API Functions
export const translationsApi = {
  /**
   * Create translations for an entity field
   * Automatically detects language and generates translations for all supported languages
   */
  createTranslations: async (data: CreateTranslationRequest): Promise<TranslationResponse> => {
    const response = await apiClient.post<TranslationResponse>('/translations', data);
    return response.data;
  },

  /**
   * Update a specific translation (manual edit)
   */
  updateTranslation: async (data: UpdateTranslationRequest): Promise<void> => {
    await apiClient.put('/translations', data);
  },

  /**
   * Get all translations for an entity
   */
  getEntityTranslations: async (
    entityType: EntityType,
    entityId: string,
  ): Promise<EntityTranslations> => {
    const response = await apiClient.get<EntityTranslations>(
      `/translations/entity/${entityType}/${entityId}`,
    );
    return response.data;
  },

  /**
   * Get translation for a specific field in a language
   */
  getTranslation: async (data: GetTranslationRequest): Promise<string | null> => {
    const response = await apiClient.get<{ translation: string | null }>('/translations/translate', {
      params: data,
    });
    return response.data.translation;
  },

  /**
   * Get all supported languages
   */
  getSupportedLanguages: async (activeOnly = true): Promise<SupportedLanguage[]> => {
    const response = await apiClient.get<SupportedLanguage[]>('/translations/languages', {
      params: { activeOnly },
    });
    return response.data;
  },

  /**
   * Get default language
   */
  getDefaultLanguage: async (): Promise<SupportedLanguage | null> => {
    const response = await apiClient.get<SupportedLanguage | null>('/translations/languages/default');
    return response.data;
  },

  /**
   * Delete all translations for an entity
   */
  deleteEntityTranslations: async (entityType: EntityType, entityId: string): Promise<void> => {
    await apiClient.delete(`/translations/delete/${entityType}/${entityId}`);
  },

  // ==================== ADMIN ENDPOINTS (Phase 5: Language Management) ====================

  /**
   * Create a new supported language (Admin only)
   */
  createLanguage: async (data: {
    code: string;
    name: string;
    nativeName: string;
    rtl?: boolean;
    isDefault?: boolean;
  }): Promise<SupportedLanguage> => {
    const response = await apiClient.post<SupportedLanguage>('/translations/admin/languages', data);
    return response.data;
  },

  /**
   * Update a supported language (Admin only)
   */
  updateLanguage: async (
    code: string,
    data: {
      name?: string;
      nativeName?: string;
      rtl?: boolean;
      isActive?: boolean;
      isDefault?: boolean;
    },
  ): Promise<SupportedLanguage> => {
    const response = await apiClient.put<SupportedLanguage>(`/translations/admin/languages/${code}`, data);
    return response.data;
  },

  /**
   * Get all languages including inactive (Admin only)
   */
  getAllLanguagesAdmin: async (activeOnly = false): Promise<SupportedLanguage[]> => {
    const response = await apiClient.get<SupportedLanguage[]>('/translations/admin/languages', {
      params: { activeOnly },
    });
    return response.data;
  },

  /**
   * Delete a language (Admin only)
   */
  deleteLanguage: async (code: string): Promise<void> => {
    await apiClient.delete(`/translations/admin/languages/${code}`);
  },

  /**
   * Re-translate an entity using AI (Admin only)
   */
  retranslate: async (data: {
    entityType: string;
    entityId: string;
    targetLanguages?: string[];
  }): Promise<{ message: string; targetLanguages: string[]; fieldsTranslated: string[] }> => {
    const response = await apiClient.post('/translations/admin/retranslate', data);
    return response.data;
  },
};

