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
      this.logger.log(`Initialized Gemini AI with model: ${modelName}`);
    } catch (error) {
      this.logger.error(`Failed to initialize Gemini AI: ${error.message}`);
      throw new InternalServerErrorException('Failed to initialize AI translation service');
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

      const result = await this.model.generateContent(prompt);
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
  private setCachedTranslation(cacheKey: string, translations: TranslationResult): void {
    // If cache is too large, remove oldest entries
    if (this.translationCache.size >= this.maxCacheSize) {
      const oldestKey = this.translationCache.keys().next().value;
      this.translationCache.delete(oldestKey);
    }

    this.translationCache.set(cacheKey, {
      translations,
      timestamp: Date.now(),
    });
    this.logger.debug(`Cached translation: ${cacheKey.substring(0, 50)}...`);
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

      const result = await this.model.generateContent(prompt);
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
   * Batch translate multiple texts (more efficient)
   */
  async translateBatch(
    texts: Array<{ text: string; fieldName: string }>,
    targetLanguages: string[],
    sourceLanguage?: string,
  ): Promise<Array<{ fieldName: string; translations: TranslationResult }>> {
    if (!this.model) {
      throw new BadRequestException('AI translation service is not configured');
    }

    const results: Array<{ fieldName: string; translations: TranslationResult }> = [];

    // Process in parallel (with rate limiting consideration)
    const translationPromises = texts.map(async ({ text, fieldName }) => {
      try {
        const translations = await this.translateText(text, targetLanguages, sourceLanguage);
        return { fieldName, translations };
      } catch (error) {
        this.logger.error(`Failed to translate ${fieldName}: ${error.message}`);
        return { fieldName, translations: {} };
      }
    });

    return Promise.all(translationPromises);
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    return [...this.supportedLanguages];
  }
}

