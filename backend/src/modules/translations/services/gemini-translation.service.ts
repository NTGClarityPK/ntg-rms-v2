import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface TranslationResult {
  [languageCode: string]: string;
}

export interface LanguageDetectionResult {
  language: string;
  confidence: number;
}

interface CacheEntry {
  translations: TranslationResult;
  timestamp: number;
}

@Injectable()
export class GeminiTranslationService {
  private readonly logger = new Logger(GeminiTranslationService.name);
  private genAI: GoogleGenerativeAI;
  private model: any;
  private alternateModel: any; // Add alternate model
  private readonly supportedLanguages = ['en', 'ar', 'ku', 'fr'];
  private readonly defaultModel = 'gemini-pro';
  
  // Translation cache: key -> { translations, timestamp }
  private translationCache: Map<string, CacheEntry> = new Map();
  private readonly cacheTTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  private readonly maxCacheSize = 1000; // Maximum number of cached entries

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not found. Translation features will be limited.');
      return;
    }

    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      const modelName = this.configService.get<string>('GEMINI_MODEL') || this.defaultModel;
      this.model = this.genAI.getGenerativeModel({ model: modelName });
      this.logger.log(`Initialized Gemini AI with primary model: ${modelName}`);
      
      // Initialize alternate model if configured
      const alternateModelName = this.configService.get<string>('ALTERNATE_GEMINI_MODEL');
      if (alternateModelName) {
        this.alternateModel = this.genAI.getGenerativeModel({ model: alternateModelName });
        this.logger.log(`Initialized Gemini AI with alternate model: ${alternateModelName}`);
      }
    } catch (error) {
      this.logger.error(`Failed to initialize Gemini AI: ${error.message}`);
      throw new InternalServerErrorException('Failed to initialize AI translation service');
    }
  }

  /**
   * Check if error is a model overload error
   */
  private isModelOverloadError(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';
    const statusCode = error?.response?.status || error?.status;
    
    return (
      statusCode === 503 ||
      errorMessage.includes('overload') ||
      errorMessage.includes('service unavailable') ||
      errorMessage.includes('503') ||
      errorMessage.includes('model is overloaded')
    );
  }

  /**
   * Execute translation with retry and fallback logic
   */
  private async executeTranslationWithRetry(
    prompt: string,
    useAlternate: boolean = false,
    retryCount: number = 0
  ): Promise<any> {
    const modelToUse = useAlternate ? this.alternateModel : this.model;
    const modelName = useAlternate 
      ? this.configService.get<string>('ALTERNATE_GEMINI_MODEL') || 'alternate'
      : this.configService.get<string>('GEMINI_MODEL') || this.defaultModel;

    if (!modelToUse) {
      throw new InternalServerErrorException('No available model for translation');
    }

    try {
      return await modelToUse.generateContent(prompt);
    } catch (error) {
      if (this.isModelOverloadError(error)) {
        // If primary model overloaded and we haven't tried alternate yet
        if (!useAlternate && this.alternateModel && retryCount === 0) {
          this.logger.warn(`Primary model overloaded, switching to alternate model: ${this.configService.get<string>('ALTERNATE_GEMINI_MODEL')}`);
          // Wait a bit before trying alternate
          await new Promise(resolve => setTimeout(resolve, 2000));
          return this.executeTranslationWithRetry(prompt, true, 0);
        }
        
        // If already using alternate or no alternate available, wait and retry
        if (retryCount < 2) {
          const waitTime = (retryCount + 1) * 5000; // 5s, 10s
          this.logger.warn(`Model overload detected (attempt ${retryCount + 1}/2). Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return this.executeTranslationWithRetry(prompt, useAlternate, retryCount + 1);
        }
        
        throw new InternalServerErrorException('Model is overloaded. Please try again later.');
      }
      
      // Re-throw non-overload errors
      throw error;
    }
  }

  /**
   * Detect the language of the input text
   */
  async detectLanguage(text: string): Promise<LanguageDetectionResult> {
    if (!this.model) {
      // Fallback: try basic detection based on character patterns
      return this.fallbackLanguageDetection(text);
    }

    try {
      const prompt = `Detect the language of the following text and respond with only the ISO 639-1 language code (e.g., en, ar, ku, fr, es, etc.) and confidence (0-1), separated by a comma. If uncertain, use 'en' as default.

Text: "${text}"

Response format: language_code,confidence
Example: ar,0.95`;

      // Use retry logic with fallback
      const result = await this.executeTranslationWithRetry(prompt);
      const response = result.response.text().trim();
      
      const [language, confidenceStr] = response.split(',');
      const confidence = parseFloat(confidenceStr || '0.8');

      // Validate language code
      const detectedLang = (language || 'en').trim().toLowerCase().substring(0, 2);
      
      return {
        language: detectedLang,
        confidence: isNaN(confidence) ? 0.8 : confidence,
      };
    } catch (error) {
      this.logger.error(`Language detection failed: ${error.message}`);
      return this.fallbackLanguageDetection(text);
    }
  }

  /**
   * Fallback language detection using character patterns
   */
  private fallbackLanguageDetection(text: string): LanguageDetectionResult {
    const arabicPattern = /[\u0600-\u06FF]/;
    const kurdishPattern = /[\u06A4-\u06FF\u0750-\u077F]/;
    
    if (arabicPattern.test(text)) {
      return { language: 'ar', confidence: 0.7 };
    }
    if (kurdishPattern.test(text)) {
      return { language: 'ku', confidence: 0.7 };
    }
    
    // Default to English
    return { language: 'en', confidence: 0.6 };
  }

  /**
   * Generate cache key for translation request
   */
  private getCacheKey(text: string, targetLanguages: string[], sourceLanguage?: string): string {
    const normalizedText = text.trim().toLowerCase();
    const sortedTargets = [...targetLanguages].sort().join(',');
    const source = sourceLanguage || 'auto';
    return `${normalizedText}:${source}:${sortedTargets}`;
  }

  /**
   * Get cached translation if available and not expired
   */
  private getCachedTranslation(cacheKey: string): TranslationResult | null {
    const entry = this.translationCache.get(cacheKey);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.cacheTTL) {
      // Cache expired, remove it
      this.translationCache.delete(cacheKey);
      return null;
    }

    this.logger.debug(`Cache hit for translation: ${cacheKey.substring(0, 50)}...`);
    return entry.translations;
  }

  /**
   * Store translation in cache
   */
  private setCachedTranslation(cacheKey: string, translations: TranslationResult, isBatchResult: boolean = false): void {
    // If cache is too large, remove oldest entries
    if (this.translationCache.size >= this.maxCacheSize) {
      const oldestKey = this.translationCache.keys().next().value;
      this.translationCache.delete(oldestKey);
    }

    this.translationCache.set(cacheKey, {
      translations,
      timestamp: Date.now(),
    });
    
    // Only log cache operations for individual translations, not batch results (to avoid confusion)
    if (!isBatchResult) {
      this.logger.debug(`Cached translation: ${cacheKey.substring(0, 50)}...`);
    }
  }

  /**
   * Clear expired cache entries (can be called periodically)
   */
  clearExpiredCache(): void {
    const now = Date.now();
    let clearedCount = 0;

    for (const [key, entry] of this.translationCache.entries()) {
      if (now - entry.timestamp > this.cacheTTL) {
        this.translationCache.delete(key);
        clearedCount++;
      }
    }

    if (clearedCount > 0) {
      this.logger.log(`Cleared ${clearedCount} expired cache entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; ttlHours: number } {
    return {
      size: this.translationCache.size,
      maxSize: this.maxCacheSize,
      ttlHours: this.cacheTTL / (60 * 60 * 1000),
    };
  }

  /**
   * Translate text to multiple target languages
   */
  async translateText(
    text: string,
    targetLanguages: string[],
    sourceLanguage?: string,
  ): Promise<TranslationResult> {
    if (!this.model) {
      throw new BadRequestException('AI translation service is not configured');
    }

    if (!text || text.trim().length === 0) {
      return {};
    }

    // Remove languages that match source or are not supported
    const validTargetLanguages = targetLanguages.filter(
      lang => lang !== sourceLanguage && this.supportedLanguages.includes(lang),
    );

    if (validTargetLanguages.length === 0) {
      return {};
    }

    // Check cache first
    const cacheKey = this.getCacheKey(text, validTargetLanguages, sourceLanguage);
    const cached = this.getCachedTranslation(cacheKey);
    if (cached) {
      return cached;
    }

    this.logger.debug(`Cache miss, calling Gemini API for: ${text.substring(0, 50)}...`);

    try {
      // Build translation prompt
      const languageNames: { [key: string]: string } = {
        en: 'English',
        ar: 'Arabic',
        ku: 'Kurdish',
        fr: 'French',
      };

      const targetList = validTargetLanguages.map(lang => languageNames[lang] || lang).join(', ');
      const sourceLangName = sourceLanguage ? languageNames[sourceLanguage] || sourceLanguage : 'the source language';

      const prompt = `Translate the following text from ${sourceLangName} to ${targetList}. 
Return a JSON object with language codes as keys and translations as values. 
Only include the JSON object, no explanations.

Text to translate: "${text}"

Response format:
{
  "en": "translation in English",
  "ar": "translation in Arabic",
  "ku": "translation in Kurdish",
  "fr": "translation in French"
}

Only include the languages requested: ${validTargetLanguages.join(', ')}`;

      // Use retry logic with fallback
      const result = await this.executeTranslationWithRetry(prompt);
      const responseText = result.response.text().trim();

      // Parse JSON response
      let translations: TranslationResult;
      try {
        // Extract JSON from response (might have markdown code blocks)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const jsonText = jsonMatch ? jsonMatch[0] : responseText;
        translations = JSON.parse(jsonText);
      } catch (parseError) {
        this.logger.error(`Failed to parse translation response: ${responseText}`);
        throw new InternalServerErrorException('Failed to parse AI translation response');
      }

      // Validate and filter translations
      const resultTranslations: TranslationResult = {};
      for (const lang of validTargetLanguages) {
        if (translations[lang] && typeof translations[lang] === 'string') {
          resultTranslations[lang] = translations[lang].trim();
        }
      }

      // Cache the result
      if (Object.keys(resultTranslations).length > 0) {
        this.setCachedTranslation(cacheKey, resultTranslations);
      }

      return resultTranslations;
    } catch (error) {
      this.logger.error(`Translation failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Failed to translate text: ${error.message}`);
    }
  }

  /**
   * Batch translate multiple texts in a single API call (more efficient)
   * Sends all fields together to reduce API calls
   */
  async translateBatch(
    texts: Array<{ text: string; fieldName: string }>,
    targetLanguages: string[],
    sourceLanguage?: string,
  ): Promise<Array<{ fieldName: string; translations: TranslationResult }>> {
    if (!this.model) {
      throw new BadRequestException('AI translation service is not configured');
    }

    if (!texts || texts.length === 0) {
      return [];
    }

    // Filter out empty texts
    const validTexts = texts.filter(({ text }) => text && text.trim().length > 0);
    if (validTexts.length === 0) {
      return texts.map(({ fieldName }) => ({ fieldName, translations: {} }));
    }

    // If only one text, use the single translation method (simpler)
    if (validTexts.length === 1) {
      try {
        const translations = await this.translateText(
          validTexts[0].text,
          targetLanguages,
          sourceLanguage,
        );
        return [{ fieldName: validTexts[0].fieldName, translations }];
      } catch (error) {
        this.logger.error(`Failed to translate ${validTexts[0].fieldName}: ${error.message}`);
        return [{ fieldName: validTexts[0].fieldName, translations: {} }];
      }
    }

    // Remove languages that match source or are not supported
    const validTargetLanguages = targetLanguages.filter(
      lang => lang !== sourceLanguage && this.supportedLanguages.includes(lang),
    );

    if (validTargetLanguages.length === 0) {
      return validTexts.map(({ fieldName }) => ({ fieldName, translations: {} }));
    }

    // Check cache for all texts first
    const cacheResults: Map<number, TranslationResult> = new Map();
    const uncachedTexts: Array<{ text: string; fieldName: string; index: number }> = [];

    for (let i = 0; i < validTexts.length; i++) {
      const { text, fieldName } = validTexts[i];
      const cacheKey = this.getCacheKey(text, validTargetLanguages, sourceLanguage);
      const cached = this.getCachedTranslation(cacheKey);
      if (cached) {
        cacheResults.set(i, cached);
      } else {
        uncachedTexts.push({ text, fieldName, index: i });
      }
    }

    // If all texts are cached, return cached results
    if (uncachedTexts.length === 0) {
      return validTexts.map(({ fieldName }, i) => ({
        fieldName,
        translations: cacheResults.get(i) || {},
      }));
    }

    // Build batch translation prompt for uncached texts
    const languageNames: { [key: string]: string } = {
      en: 'English',
      ar: 'Arabic',
      ku: 'Kurdish',
      fr: 'French',
    };

    const targetList = validTargetLanguages.map(lang => languageNames[lang] || lang).join(', ');
    const sourceLangName = sourceLanguage ? languageNames[sourceLanguage] || sourceLanguage : 'the source language';

    // Create a list of texts to translate (field names are only for reference, not to be translated)
    const textsList = uncachedTexts
      .map(({ text, fieldName }, idx) => `${idx + 1}. [${fieldName}] "${text}"`)
      .join('\n');

    const prompt = `Translate ONLY the text content (the text inside quotes) from ${sourceLangName} to ${targetList}. 
DO NOT translate field names or labels (the text in square brackets). Only translate the actual content.

Texts to translate:
${textsList}

IMPORTANT: 
- Translate ONLY the text content inside the quotes
- DO NOT include field names, labels, or any text outside the quotes in your translations
- Return a JSON object where each key is a number (1, 2, 3, etc.) corresponding to the text order
- Each value should be an object with language codes as keys and ONLY the translated text content as values

Response format:
{
  "1": {
    "${validTargetLanguages[0]}": "translated text content only",
    "${validTargetLanguages[1] || ''}": "translated text content only"
  },
  "2": {
    "${validTargetLanguages[0]}": "translated text content only",
    "${validTargetLanguages[1] || ''}": "translated text content only"
  }
}

Only include the languages requested: ${validTargetLanguages.join(', ')}
Only translate the text content, not field names or labels.`;

    this.logger.debug(`Batch translation: calling Gemini API for ${uncachedTexts.length} fields in a SINGLE request...`);

    try {
      // Use retry logic with fallback
      const result = await this.executeTranslationWithRetry(prompt);
      const responseText = result.response.text().trim();

      // Parse JSON response
      let batchTranslations: { [key: string]: TranslationResult };
      try {
        // Extract JSON from response (might have markdown code blocks)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const jsonText = jsonMatch ? jsonMatch[0] : responseText;
        batchTranslations = JSON.parse(jsonText);
      } catch (parseError) {
        this.logger.error(`Failed to parse batch translation response: ${responseText}`);
        // Fallback: try individual translations for uncached texts
        const fallbackResults = await this.fallbackToIndividualTranslations(uncachedTexts, validTargetLanguages, sourceLanguage);
        
        // Map fallback results back to original indices
        const fallbackResultsMap = new Map<number, TranslationResult>();
        for (let i = 0; i < uncachedTexts.length; i++) {
          fallbackResultsMap.set(uncachedTexts[i].index, fallbackResults[i].translations);
        }
        
        // Build final results combining cached and fallback results
        const results: Array<{ fieldName: string; translations: TranslationResult }> = [];
        let validTextIndex = 0;
        for (const { fieldName, text } of texts) {
          if (!text || text.trim().length === 0) {
            results.push({ fieldName, translations: {} });
          } else {
            const translations = cacheResults.get(validTextIndex) || fallbackResultsMap.get(validTextIndex) || {};
            results.push({ fieldName, translations });
            validTextIndex++;
          }
        }
        return results;
      }

      // Process results and cache them
      // Create a map of uncached text results
      const uncachedResultsMap = new Map<number, TranslationResult>();
      
      for (let i = 0; i < uncachedTexts.length; i++) {
        const uncachedText = uncachedTexts[i];
        // Get translation result using 1-based index (as per prompt)
        const resultKey = String(i + 1);
        const fieldTranslations = batchTranslations[resultKey] || {};

        // Validate and filter translations
        const resultTranslations: TranslationResult = {};
        for (const lang of validTargetLanguages) {
          if (fieldTranslations[lang] && typeof fieldTranslations[lang] === 'string') {
            let translatedText = fieldTranslations[lang].trim();
            
            // Remove any field name prefixes that might have been included by the AI
            // Common patterns: "nom: ", "name: ", "[nom] ", "[name] ", etc.
            
            // First, try to match the exact field name with colon/colon-space
            const escapedFieldName = uncachedText.fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const fieldNamePatterns = [
              new RegExp(`^\\s*${escapedFieldName}\\s*[:：]\\s*`, 'i'), // "nom: " or "name: "
              new RegExp(`^\\s*\\[${escapedFieldName}\\]\\s*[:：]?\\s*`, 'i'), // "[nom] " or "[name] "
            ];
            
            // Also check for common field name translations
            const commonFieldNames = ['name', 'nom', 'description', 'description', 'address', 'adresse', 'city', 'ville', 'state', 'état', 'country', 'pays', 'notes', 'notes', 'title', 'titre'];
            for (const commonName of commonFieldNames) {
              fieldNamePatterns.push(
                new RegExp(`^\\s*${commonName}\\s*[:：]\\s*`, 'i'),
                new RegExp(`^\\s*\\[${commonName}\\]\\s*[:：]?\\s*`, 'i')
              );
            }
            
            // Apply all patterns
            for (const pattern of fieldNamePatterns) {
              translatedText = translatedText.replace(pattern, '');
            }
            
            resultTranslations[lang] = translatedText.trim();
          }
        }

        // Store result mapped to original validTexts index
        uncachedResultsMap.set(uncachedText.index, resultTranslations);

        // Cache the result (mark as batch result to avoid confusing log messages)
        if (Object.keys(resultTranslations).length > 0) {
          const cacheKey = this.getCacheKey(uncachedText.text, validTargetLanguages, sourceLanguage);
          this.setCachedTranslation(cacheKey, resultTranslations, true); // true = batch result
        } else {
          this.logger.warn(`No translations received for field: ${uncachedText.fieldName} in batch response`);
        }
      }

      // Build final results array maintaining original order
      const results: Array<{ fieldName: string; translations: TranslationResult }> = [];
      
      // Map original texts array to results
      let validTextIndex = 0;
      for (const { fieldName, text } of texts) {
        if (!text || text.trim().length === 0) {
          // Empty text
          results.push({ fieldName, translations: {} });
        } else {
          // Check if cached or from batch result
          const translations = cacheResults.get(validTextIndex) || uncachedResultsMap.get(validTextIndex) || {};
          results.push({ fieldName, translations });
          validTextIndex++;
        }
      }

      return results;
    } catch (error) {
      this.logger.error(`Batch translation failed: ${error.message}`, error.stack);
      // Fallback to individual translations if batch fails
      const fallbackResults = await this.fallbackToIndividualTranslations(uncachedTexts, validTargetLanguages, sourceLanguage);
      
      // Map fallback results back to original indices
      const fallbackResultsMap = new Map<number, TranslationResult>();
      for (let i = 0; i < uncachedTexts.length; i++) {
        fallbackResultsMap.set(uncachedTexts[i].index, fallbackResults[i].translations);
      }
      
      // Build final results combining cached and fallback results
      const results: Array<{ fieldName: string; translations: TranslationResult }> = [];
      let validTextIndex = 0;
      for (const { fieldName, text } of texts) {
        if (!text || text.trim().length === 0) {
          results.push({ fieldName, translations: {} });
        } else {
          const translations = cacheResults.get(validTextIndex) || fallbackResultsMap.get(validTextIndex) || {};
          results.push({ fieldName, translations });
          validTextIndex++;
        }
      }
      return results;
    }
  }

  /**
   * Fallback method: translate texts individually if batch translation fails
   */
  private async fallbackToIndividualTranslations(
    texts: Array<{ text: string; fieldName: string; index: number }>,
    targetLanguages: string[],
    sourceLanguage?: string,
  ): Promise<Array<{ fieldName: string; translations: TranslationResult }>> {
    this.logger.warn('Falling back to individual translations due to batch failure');
    
    const translationPromises = texts.map(async ({ text, fieldName }) => {
      try {
        const translations = await this.translateText(text, targetLanguages, sourceLanguage);
        return { fieldName, translations };
      } catch (error) {
        this.logger.error(`Failed to translate ${fieldName}: ${error.message}`);
        return { fieldName, translations: {} };
      }
    });

    const results = await Promise.all(translationPromises);
    // Return results maintaining order (index is preserved in the array order)
    return results;
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    return [...this.supportedLanguages];
  }
}

