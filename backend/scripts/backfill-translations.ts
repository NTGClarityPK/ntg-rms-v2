/**
 * Script to backfill translations for existing entities
 * 
 * This script migrates existing data from entity tables to the translation system:
 * - Creates translation_metadata records for all entities
 * - Migrates existing name/description fields to translations table (English)
 * - Generates translations for AR, KU, FR using Gemini AI
 * 
 * Rate Limiting:
 * - Free tier: 5 requests/minute = ~13 seconds between requests
 * - Rate limiter automatically handles delays
 * - Script processes entities sequentially to respect limits
 * 
 * Entity Coverage:
 * ✅ ingredient - name, storage_location
 * ✅ category - name, description
 * ✅ food_item - name, description
 * ✅ addon - name
 * ✅ addon_group - name
 * ✅ variation - name
 * ✅ variation_group - name
 * ✅ buffet - name, description
 * ✅ combo_meal - name, description
 * ✅ menu - name
 * ✅ branch - name, city, address
 * ✅ customer - name, notes
 * ✅ employee (users) - name
 * ✅ tax - name
 * ✅ restaurant (tenants) - name
 * ✅ stock_operation (stock_transactions) - reason, supplier_name
 * ✅ invoice - Invoice settings (header, footer, terms_and_conditions) from tenant_settings
 * 
 * Usage:
 *   npm run script:backfill-translations
 *   OR
 *   npx ts-node -r dotenv/config scripts/backfill-translations.ts
 * 
 * Options:
 *   --tenant-id <uuid>  - Process only specific tenant (optional)
 *   --entity-type <type> - Process only specific entity type (optional)
 *   --dry-run           - Show what would be migrated without actually doing it
 *   --skip-ai           - Skip AI translation generation (only migrate existing data)
 */

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables manually
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const envFile of envFiles) {
    const envPath = path.join(process.cwd(), envFile);
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      content.split('\n').forEach((line) => {
        const match = line.match(/^([^=:#]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      });
    }
  }
}

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || 'gemini-pro';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Missing Supabase configuration. Please check your .env file.');
  process.exit(1);
}

if (!geminiApiKey && !process.argv.includes('--skip-ai')) {
  console.error('❌ Missing GEMINI_API_KEY. Set it in .env or use --skip-ai flag.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// Parse command line arguments
const args = process.argv.slice(2);
const tenantId = args.find(arg => arg.startsWith('--tenant-id='))?.split('=')[1];
const entityType = args.find(arg => arg.startsWith('--entity-type='))?.split('=')[1];
const dryRun = args.includes('--dry-run');
const skipAI = args.includes('--skip-ai');

// Rate limiter for free tier (5 requests per minute = 1 request every 12 seconds)
// Adding buffer, so we use 13 seconds between requests
class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests = 5;
  private readonly timeWindow = 60000; // 60 seconds
  private readonly minDelay = 13000; // 13 seconds between requests (safe for 5/min)

  async wait(): Promise<void> {
    const now = Date.now();
    
    // Remove old requests outside the time window
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    
    // If we're at the limit, wait until we can make a new request
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.timeWindow - (now - oldestRequest) + 1000; // Add 1 second buffer
      console.log(`   ⏳ Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      // Clean up after waiting
      this.requests = this.requests.filter(time => Date.now() - time < this.timeWindow);
    }
    
    // Add current request timestamp
    this.requests.push(Date.now());
    
    // Always wait minimum delay to be safe
    await new Promise(resolve => setTimeout(resolve, this.minDelay));
  }
}

const rateLimiter = new RateLimiter();

interface EntityConfig {
  table: string;
  entityType: string;
  fields: { dbField: string; translationField: string }[];
  whereClause?: string;
}

const ENTITY_CONFIGS: EntityConfig[] = [
  {
    table: 'ingredients',
    entityType: 'ingredient',
    fields: [
      { dbField: 'name', translationField: 'name' },
      { dbField: 'storage_location', translationField: 'storage_location' },
    ],
  },
  {
    table: 'categories',
    entityType: 'category',
    fields: [
      { dbField: 'name', translationField: 'name' },
      { dbField: 'description', translationField: 'description' },
    ],
  },
  {
    table: 'food_items',
    entityType: 'food_item',
    fields: [
      { dbField: 'name', translationField: 'name' },
      { dbField: 'description', translationField: 'description' },
    ],
  },
  {
    table: 'add_on_groups',
    entityType: 'addon_group',
    fields: [
      { dbField: 'name', translationField: 'name' },
    ],
  },
  {
    table: 'add_ons',
    entityType: 'addon',
    fields: [
      { dbField: 'name', translationField: 'name' },
    ],
  },
  {
    table: 'variation_groups',
    entityType: 'variation_group',
    fields: [
      { dbField: 'name', translationField: 'name' },
    ],
  },
  {
    table: 'variations',
    entityType: 'variation',
    fields: [
      { dbField: 'name', translationField: 'name' },
    ],
  },
  {
    table: 'buffets',
    entityType: 'buffet',
    fields: [
      { dbField: 'name', translationField: 'name' },
      { dbField: 'description', translationField: 'description' },
    ],
  },
  {
    table: 'combo_meals',
    entityType: 'combo_meal',
    fields: [
      { dbField: 'name', translationField: 'name' },
      { dbField: 'description', translationField: 'description' },
    ],
  },
  {
    table: 'branches',
    entityType: 'branch',
    fields: [
      { dbField: 'name', translationField: 'name' },
      { dbField: 'city', translationField: 'city' },
      { dbField: 'address', translationField: 'address' },
    ],
  },
  {
    table: 'customers',
    entityType: 'customer',
    fields: [
      { dbField: 'name', translationField: 'name' },
      { dbField: 'notes', translationField: 'notes' },
    ],
  },
  {
    table: 'users',
    entityType: 'employee',
    fields: [
      { dbField: 'name', translationField: 'name' },
    ],
    whereClause: "role != 'owner'", // Only employees, not owners
  },
  {
    table: 'taxes',
    entityType: 'tax',
    fields: [
      { dbField: 'name', translationField: 'name' },
    ],
  },
  {
    table: 'tenants',
    entityType: 'restaurant',
    fields: [
      { dbField: 'name', translationField: 'name' },
    ],
  },
  {
    table: 'menus',
    entityType: 'menu',
    fields: [
      { dbField: 'name', translationField: 'name' },
    ],
  },
  {
    table: 'stock_transactions',
    entityType: 'stock_operation',
    fields: [
      { dbField: 'reason', translationField: 'reason' },
      { dbField: 'supplier_name', translationField: 'supplier_name' },
    ],
  },
  // Note: invoice settings (header, footer, terms_and_conditions) are stored in tenant_settings
  // as JSONB, not as individual invoice records. They are handled separately below.
];

// Special function to backfill invoice settings from tenant_settings
async function backfillInvoiceSettings(tenantId?: string): Promise<{ processed: number; skipped: number; errors: number }> {
  console.log('\n📄 Processing invoice settings (from tenant_settings)...');

  let query = supabase.from('tenant_settings').select('id, tenant_id, invoice');

  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  const { data: settings, error } = await query;

  if (error) {
    console.error('❌ Error fetching tenant_settings:', error.message);
    return;
  }

  if (!settings || settings.length === 0) {
    console.log('   ⚠️  No tenant settings found');
    return { processed: 0, skipped: 0, errors: 0 };
  }

  const stats = { processed: 0, skipped: 0, errors: 0 };

  for (const setting of settings) {
    try {
      const invoiceSettings = setting.invoice as any;
      if (!invoiceSettings) {
        stats.skipped++;
        continue;
      }

      // Check if already has translations
      const { data: existingMetadata } = await supabase
        .from('translation_metadata')
        .select('id')
        .eq('entity_type', 'invoice')
        .eq('entity_id', setting.tenant_id) // Use tenant_id as entity_id for invoice settings
        .maybeSingle();

      const hasTranslations = existingMetadata ? true : false;
      if (hasTranslations && !dryRun) {
        const { data: existingTranslations } = await supabase
          .from('translations')
          .select('language_code, field_name')
          .eq('metadata_id', existingMetadata.id);

        const hasAllFields = ['header', 'footer', 'terms_and_conditions'].every((field) =>
          existingTranslations?.some(
            (t) => t.language_code === 'en' && t.field_name === field
          )
        );

        if (hasAllFields && existingTranslations && existingTranslations.length > 0) {
          stats.skipped++;
          continue;
        }
      }

      if (dryRun) {
        console.log(`   [DRY RUN] Would migrate invoice settings for tenant ${setting.tenant_id}`);
        stats.processed++;
        continue;
      }

      const fieldTranslations: Record<string, Record<string, string>> = {};
      const fields = [
        { dbField: 'headerText', translationField: 'header' },
        { dbField: 'footerText', translationField: 'footer' },
        { dbField: 'termsAndConditions', translationField: 'terms_and_conditions' },
      ];

      for (const field of fields) {
        const sourceText = invoiceSettings[field.dbField];
        if (!sourceText) continue;

        fieldTranslations[field.translationField] = {
          en: sourceText,
        };

        // Generate AI translations if enabled
        if (!skipAI && genAI) {
          console.log(`      Translating invoice ${field.translationField}...`);
          const languages = ['ar', 'ku', 'fr'];

          for (const lang of languages) {
            try {
              const translation = await translateText(sourceText, lang);
              fieldTranslations[field.translationField][lang] = translation;
            } catch (error) {
              console.error(`      ⚠️  Failed to translate invoice ${field.translationField} to ${lang}:`, error);
            }
          }
        }
      }

      if (Object.keys(fieldTranslations).length > 0) {
        // Use tenant_id as entity_id for invoice settings
        await createTranslations('invoice', setting.tenant_id, fieldTranslations);
        stats.processed++;
      } else {
        stats.skipped++;
      }
    } catch (error) {
      console.error(`   ❌ Error processing invoice settings for tenant ${setting.tenant_id}:`, error);
      stats.errors++;
    }
  }

  console.log(`   ✅ Processed: ${stats.processed}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`);
  return { processed: stats.processed, skipped: stats.skipped, errors: stats.errors };
}

// AI Translation helper with rate limiting
async function translateText(text: string, targetLanguage: string): Promise<string> {
  if (!text || !text.trim()) return text;
  if (!genAI) throw new Error('Gemini AI not initialized');

  // Wait for rate limiter before making request
  await rateLimiter.wait();

  try {
    const model = genAI.getGenerativeModel({ model: geminiModel });
    
    const prompt = `Translate the following text to ${targetLanguage === 'ar' ? 'Arabic' : targetLanguage === 'ku' ? 'Kurdish (Kurmanji)' : targetLanguage === 'fr' ? 'French' : 'English'}. Only return the translation, nothing else.

Text: "${text}"`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const translation = response.text().trim();

    return translation || text;
  } catch (error: any) {
    // Check if it's a rate limit error
    if (error?.message?.includes('429') || error?.message?.includes('quota') || error?.message?.includes('rate limit')) {
      console.error(`   ⚠️  Rate limit hit! Waiting 60 seconds before retry...`);
      await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
      // Clear rate limiter to start fresh
      rateLimiter['requests'] = [];
      // Retry once
      return translateText(text, targetLanguage);
    }
    console.error(`   ⚠️  Translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return text; // Return original text on error
  }
}

// Create translation metadata and translations
async function createTranslations(
  entityType: string,
  entityId: string,
  fieldTranslations: Record<string, Record<string, string>> // { fieldName: { language: text } }
): Promise<void> {
  // Create or get translation metadata
  let { data: metadata, error: metadataError } = await supabase
    .from('translation_metadata')
    .select('id')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle();

  if (metadataError && metadataError.code !== 'PGRST116') {
    throw metadataError;
  }

  let metadataId: string;

  if (!metadata) {
    // Create metadata
    const { data: newMetadata, error: createError } = await supabase
      .from('translation_metadata')
      .insert({
        entity_type: entityType,
        entity_id: entityId,
        source_language: 'en', // Assume English as source for existing data
      })
      .select('id')
      .single();

    if (createError) throw createError;
    metadataId = newMetadata.id;
  } else {
    metadataId = metadata.id;
  }

  // Insert translations
  const translationsToInsert: any[] = [];
  for (const [fieldName, translations] of Object.entries(fieldTranslations)) {
    for (const [languageCode, text] of Object.entries(translations)) {
      if (text && text.trim()) {
        translationsToInsert.push({
          metadata_id: metadataId,
          language_code: languageCode,
          field_name: fieldName,
          translated_text: text,
          is_ai_generated: languageCode !== 'en', // English is original, others are AI-generated
        });
      }
    }
  }

  if (translationsToInsert.length > 0) {
    // Use upsert to handle duplicates
    const { error: insertError } = await supabase
      .from('translations')
      .upsert(translationsToInsert, {
        onConflict: 'metadata_id,language_code,field_name',
      });

    if (insertError) throw insertError;
  }
}

// Process single entity
async function processEntity(
  config: EntityConfig,
  entity: any,
  stats: { processed: number; skipped: number; errors: number }
): Promise<void> {
  const entityId = entity.id;
  const tenantId = entity.tenant_id;

  try {
    // Check if already has translations
    const { data: existingMetadata } = await supabase
      .from('translation_metadata')
      .select('id')
      .eq('entity_type', config.entityType)
      .eq('entity_id', entityId)
      .maybeSingle();

    if (existingMetadata) {
      // Check if has translations for all fields
      const { data: existingTranslations } = await supabase
        .from('translations')
        .select('language_code, field_name')
        .eq('metadata_id', existingMetadata.id);

      const hasAllTranslations = config.fields.every((field) => {
        const enTranslation = existingTranslations?.some(
          (t) => t.language_code === 'en' && t.field_name === field.translationField
        );
        return enTranslation;
      });

      if (hasAllTranslations && existingTranslations && existingTranslations.length > 0) {
        stats.skipped++;
        return; // Already migrated
      }
    }

    if (dryRun) {
      console.log(`   [DRY RUN] Would migrate ${config.entityType} ${entityId}`);
      stats.processed++;
      return;
    }

    // Collect field translations
    const fieldTranslations: Record<string, Record<string, string>> = {};

    for (const field of config.fields) {
      const sourceText = entity[field.dbField];
      if (!sourceText) continue;

      fieldTranslations[field.translationField] = {
        en: sourceText, // Original text as English
      };

      // Generate AI translations if enabled
      if (!skipAI && genAI) {
        console.log(`      Translating ${field.translationField}...`);
        const languages = ['ar', 'ku', 'fr'];
        
        for (const lang of languages) {
          try {
            const translation = await translateText(sourceText, lang);
            fieldTranslations[field.translationField][lang] = translation;
            // Rate limiter already handles delays, no need for additional delay
          } catch (error) {
            console.error(`      ⚠️  Failed to translate to ${lang}:`, error);
            // Continue with other languages
          }
        }
      }
    }

    // Create translations
    await createTranslations(config.entityType, entityId, fieldTranslations);
    stats.processed++;

  } catch (error) {
    console.error(`   ❌ Error processing ${config.entityType} ${entityId}:`, error);
    stats.errors++;
  }
}

// Main migration function
async function backfillTranslations() {
  try {
    console.log('🔄 Starting translation backfill...\n');
    
    if (dryRun) {
      console.log('⚠️  DRY RUN MODE - No changes will be made\n');
    }
    
    if (skipAI) {
      console.log('⚠️  AI translation disabled - Only migrating existing data\n');
    }

    const configsToProcess = entityType
      ? ENTITY_CONFIGS.filter(c => c.entityType === entityType)
      : ENTITY_CONFIGS;

    if (configsToProcess.length === 0) {
      console.error(`❌ No entity types found matching "${entityType}"`);
      process.exit(1);
    }

    const overallStats = {
      processed: 0,
      skipped: 0,
      errors: 0,
    };

    for (const config of configsToProcess) {
      console.log(`\n📦 Processing ${config.entityType}...`);

      let query = supabase
        .from(config.table)
        .select('id, tenant_id, ' + config.fields.map(f => f.dbField).join(', '));

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      if (config.whereClause) {
        // For complex where clauses, we'll filter after fetching
      }

      // Special handling for stock_transactions - only get records with at least one translatable field
      if (config.table === 'stock_transactions') {
        // Filter to only include transactions that have at least one of: reason or supplier_name
        query = query.or('reason.not.is.null,supplier_name.not.is.null');
      }

      const { data: entities, error } = await query;

      if (error) {
        console.error(`❌ Error fetching ${config.entityType}:`, error.message);
        continue;
      }

      if (!entities || entities.length === 0) {
        console.log(`   ⚠️  No entities found`);
        continue;
      }

      let filteredEntities = entities;
      if (config.whereClause && config.table === 'users') {
        filteredEntities = entities.filter((e: any) => e.role !== 'owner');
      }

      console.log(`   Found ${filteredEntities.length} entity(ies)`);

      const stats = { processed: 0, skipped: 0, errors: 0 };

      // Process sequentially for AI requests (to respect rate limits)
      // For free tier: 5 requests/minute = 12 seconds per request minimum
      // Rate limiter handles delays automatically
      console.log(`   Processing ${filteredEntities.length} entity(ies) sequentially...`);
      
      for (let i = 0; i < filteredEntities.length; i++) {
        const entity = filteredEntities[i];
        const entityId = (entity as any).id || `entity-${i + 1}`;
        console.log(`   [${i + 1}/${filteredEntities.length}] Processing ${config.entityType} ${entityId}...`);
        await processEntity(config, entity, stats);
        
        // Small delay between entities even without AI (to be safe)
        if (i < filteredEntities.length - 1 && !skipAI) {
          // Rate limiter will handle the actual delay for AI requests
          // But we still process sequentially to avoid overwhelming the system
        }
      }

      overallStats.processed += stats.processed;
      overallStats.skipped += stats.skipped;
      overallStats.errors += stats.errors;

      console.log(`   ✅ Processed: ${stats.processed}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`);
    }

    // Process invoice settings separately (stored in tenant_settings)
    const invoiceStats = await backfillInvoiceSettings(tenantId);
    if (invoiceStats) {
      overallStats.processed += invoiceStats.processed;
      overallStats.skipped += invoiceStats.skipped;
      overallStats.errors += invoiceStats.errors;
    }

    console.log(`\n✨ Summary:`);
    console.log(`   Processed: ${overallStats.processed}`);
    console.log(`   Skipped: ${overallStats.skipped}`);
    console.log(`   Errors: ${overallStats.errors}`);
    console.log(`   Total: ${overallStats.processed + overallStats.skipped + overallStats.errors}`);

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run the script
backfillTranslations()
  .then(() => {
    console.log('\n✨ Script finished.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

