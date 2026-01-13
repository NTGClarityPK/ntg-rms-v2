import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { RestaurantService } from '../restaurant/restaurant.service';
import { TranslationService } from '../translations/services/translation.service';

@Injectable()
export class SettingsService {
  constructor(
    private supabaseService: SupabaseService,
    @Inject(forwardRef(() => RestaurantService))
    private restaurantService: RestaurantService,
    private translationService: TranslationService,
  ) {}

  /**
   * Get all settings for a tenant and branch
   * Settings are stored as JSON in tenant_settings table
   */
  async getSettings(tenantId: string, branchId?: string, language: string = 'en') {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Build query based on whether branchId is provided
    let query = supabase
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', tenantId);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    } else {
      // If no branchId, get tenant-level settings (branch_id IS NULL)
      query = query.is('branch_id', null);
    }

    const { data: existing, error: fetchError } = await query.maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 is "not found" which is OK
      throw new InternalServerErrorException(
        `Failed to fetch settings: ${fetchError.message}`
      );
    }

    if (!existing) {
      // Return default settings
      return this.getDefaultSettings();
    }

    // Merge with defaults to ensure all settings exist
    const defaults = this.getDefaultSettings();
    const invoiceSettings = { ...defaults.invoice, ...(existing.invoice || {}) };

    // Get translations for invoice header, footer, and terms
    try {
      if (invoiceSettings.headerText) {
        const headerTranslation = await this.translationService.getTranslation({
          entityType: 'invoice',
          entityId: tenantId,
          languageCode: language,
          fieldName: 'header',
          fallbackLanguage: 'en',
        });
        if (headerTranslation) invoiceSettings.headerText = headerTranslation;
      }

      if (invoiceSettings.footerText) {
        const footerTranslation = await this.translationService.getTranslation({
          entityType: 'invoice',
          entityId: tenantId,
          languageCode: language,
          fieldName: 'footer',
          fallbackLanguage: 'en',
        });
        if (footerTranslation) invoiceSettings.footerText = footerTranslation;
      }

      if (invoiceSettings.termsAndConditions) {
        const termsTranslation = await this.translationService.getTranslation({
          entityType: 'invoice',
          entityId: tenantId,
          languageCode: language,
          fieldName: 'terms_and_conditions',
          fallbackLanguage: 'en',
        });
        if (termsTranslation) invoiceSettings.termsAndConditions = termsTranslation;
      }
    } catch (translationError) {
      console.warn(`Failed to get invoice translations for tenant ${tenantId}:`, translationError);
    }

    return {
      general: { ...defaults.general, ...(existing.general || {}) },
      invoice: invoiceSettings,
      paymentMethods: {
        ...defaults.paymentMethods,
        ...(existing.payment_methods || {}),
      },
      printers: { ...defaults.printers, ...(existing.printers || {}) },
      tax: { ...defaults.tax, ...(existing.tax || {}) },
    };
  }

  /**
   * Update settings for a tenant and branch
   */
  async updateSettings(tenantId: string, updateDto: UpdateSettingsDto, branchId?: string, language: string = 'en', userId?: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Get current settings (in original language for comparison)
    const current = await this.getSettings(tenantId, branchId, 'en');

    // Merge updates - explicitly handle false values to ensure they override defaults
    const updated = {
      general: { ...current.general, ...(updateDto.general || {}) },
      invoice: { ...current.invoice, ...(updateDto.invoice || {}) },
      payment_methods: updateDto.paymentMethods
        ? {
            // Explicitly set all payment method fields to ensure false values are preserved
            enableCash: updateDto.paymentMethods.enableCash ?? current.paymentMethods?.enableCash ?? true,
            enableCard: updateDto.paymentMethods.enableCard ?? current.paymentMethods?.enableCard ?? true,
            enableZainCash: updateDto.paymentMethods.enableZainCash ?? current.paymentMethods?.enableZainCash ?? false,
            enableAsiaHawala: updateDto.paymentMethods.enableAsiaHawala ?? current.paymentMethods?.enableAsiaHawala ?? false,
            enableBankTransfer: updateDto.paymentMethods.enableBankTransfer ?? current.paymentMethods?.enableBankTransfer ?? false,
            paymentGatewayConfig: updateDto.paymentMethods.paymentGatewayConfig ?? current.paymentMethods?.paymentGatewayConfig ?? {},
          }
        : current.paymentMethods || {},
      printers: { ...current.printers, ...(updateDto.printers || {}) },
      tax: { ...current.tax, ...(updateDto.tax || {}) },
    };

    // Upsert settings
    // Since we're using partial unique indexes, we need to handle upsert manually
    // First, check if settings exist for this tenant/branch combination
    let query = supabase
      .from('tenant_settings')
      .select('id')
      .eq('tenant_id', tenantId);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    } else {
      query = query.is('branch_id', null);
    }

    const { data: existing } = await query.maybeSingle();

    const upsertData: any = {
      tenant_id: tenantId,
      general: updated.general,
      invoice: updated.invoice,
      payment_methods: updated.payment_methods,
      printers: updated.printers,
      tax: updated.tax,
      updated_at: new Date().toISOString(),
    };

    if (branchId) {
      upsertData.branch_id = branchId;
    } else {
      upsertData.branch_id = null;
    }

    let data, error;
    if (existing) {
      // Update existing record
      let updateQuery = supabase
        .from('tenant_settings')
        .update(upsertData)
        .eq('id', existing.id)
        .select()
        .single();
      
      const result = await updateQuery;
      data = result.data;
      error = result.error;
    } else {
      // Insert new record
      const result = await supabase
        .from('tenant_settings')
        .insert(upsertData)
        .select()
        .single();
      
      data = result.data;
      error = result.error;
    }

    if (error) {
      throw new InternalServerErrorException(
        `Failed to update settings: ${error.message}`
      );
    }

    // Create/Update translations for invoice header, footer, and terms if they were updated
    try {
      if (updateDto.invoice) {
        if (updateDto.invoice.headerText !== undefined && updateDto.invoice.headerText !== current.invoice.headerText) {
          // Update the specific language translation (synchronous for immediate update)
          if (language !== 'en') {
            await this.translationService.updateTranslation(
              {
                entityType: 'invoice',
                entityId: tenantId,
                languageCode: language,
                fieldName: 'header',
                translatedText: updateDto.invoice.headerText,
                isAiGenerated: false, // Manual edit
              },
              userId,
            );
          }
          // Create translations for other languages asynchronously (fire and forget)
          // Don't block the response - translations will be processed in the background
          this.translationService.createTranslations({
            entityType: 'invoice',
            entityId: tenantId,
            fieldName: 'header',
            text: updateDto.invoice.headerText,
          }).catch((translationError) => {
            console.error('Failed to create translations for invoice header:', translationError);
          });
        }

        if (updateDto.invoice.footerText !== undefined && updateDto.invoice.footerText !== current.invoice.footerText) {
          // Update the specific language translation (synchronous for immediate update)
          if (language !== 'en') {
            await this.translationService.updateTranslation(
              {
                entityType: 'invoice',
                entityId: tenantId,
                languageCode: language,
                fieldName: 'footer',
                translatedText: updateDto.invoice.footerText,
                isAiGenerated: false, // Manual edit
              },
              userId,
            );
          }
          // Create translations for other languages asynchronously (fire and forget)
          // Don't block the response - translations will be processed in the background
          this.translationService.createTranslations({
            entityType: 'invoice',
            entityId: tenantId,
            fieldName: 'footer',
            text: updateDto.invoice.footerText,
          }).catch((translationError) => {
            console.error('Failed to create translations for invoice footer:', translationError);
          });
        }

        if (updateDto.invoice.termsAndConditions !== undefined && updateDto.invoice.termsAndConditions !== current.invoice.termsAndConditions) {
          // Update the specific language translation (synchronous for immediate update)
          if (language !== 'en') {
            await this.translationService.updateTranslation(
              {
                entityType: 'invoice',
                entityId: tenantId,
                languageCode: language,
                fieldName: 'terms_and_conditions',
                translatedText: updateDto.invoice.termsAndConditions,
                isAiGenerated: false, // Manual edit
              },
              userId,
            );
          }
          // Create translations for other languages asynchronously (fire and forget)
          // Don't block the response - translations will be processed in the background
          this.translationService.createTranslations({
            entityType: 'invoice',
            entityId: tenantId,
            fieldName: 'terms_and_conditions',
            text: updateDto.invoice.termsAndConditions,
          }).catch((translationError) => {
            console.error('Failed to create translations for invoice terms and conditions:', translationError);
          });
        }
      }
    } catch (translationError) {
      console.error('Failed to update invoice translations:', translationError);
    }

    // If totalTables was updated and branchId is provided, create missing tables
    if (
      updateDto.general?.totalTables !== undefined &&
      branchId &&
      updateDto.general.totalTables > 0
    ) {
      const newTotalTables = updateDto.general.totalTables;
      const oldTotalTables = current.general?.totalTables || 0;

      // Only create tables if totalTables increased
      if (newTotalTables > oldTotalTables) {
        try {
          // Get all existing tables for this branch
          const { data: existingTables } = await supabase
            .from('tables')
            .select('table_number')
            .eq('branch_id', branchId)
            .is('deleted_at', null);

          const existingTableNumbers = new Set(
            (existingTables || [])
              .map((t) => {
                const num = parseInt(t.table_number, 10);
                return !isNaN(num) ? num : null;
              })
              .filter((n): n is number => n !== null)
          );

          // Create missing tables (from oldTotalTables + 1 to newTotalTables)
          for (let i = oldTotalTables + 1; i <= newTotalTables; i++) {
            if (!existingTableNumbers.has(i)) {
              try {
                await this.restaurantService.createTable(tenantId, {
                  tableNumber: i.toString(),
                  branchId: branchId,
                  seatingCapacity: 4,
                  tableType: 'regular',
                });
              } catch (createError: any) {
                // If table already exists (race condition), skip it
                if (
                  createError?.response?.status === 409 ||
                  createError?.status === 409 ||
                  createError?.message?.includes('already exists')
                ) {
                  continue;
                }
                // Log other errors but don't fail the settings update
                console.warn(`Failed to create table ${i}:`, createError);
              }
            }
          }
        } catch (tableError) {
          // Log error but don't fail the settings update
          console.error('Failed to create missing tables:', tableError);
        }
      }
    }

    return {
      general: data.general,
      invoice: data.invoice,
      paymentMethods: data.payment_methods,
      printers: data.printers,
      tax: data.tax,
    };
  }

  /**
   * Get default settings
   */
  private getDefaultSettings() {
    return {
      general: {
        defaultLanguage: 'en',
        defaultCurrency: 'IQD',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '24' as '12' | '24',
        firstDayOfWeek: 'sunday',
        defaultOrderType: 'dine_in',
        autoPrintInvoices: false,
        autoPrintKitchenTickets: false,
        enableTableManagement: true,
        enableDeliveryManagement: true,
        minimumDeliveryOrderAmount: 0,
        defaultDeliveryCharge: 5.0,
        freeDeliveryThreshold: 50.0,
        emailNotifications: true,
        smsNotifications: false,
        soundAlerts: true,
        totalTables: 5, // Default number of tables
      },
      invoice: {
        headerText: '',
        footerText: '',
        termsAndConditions: '',
        showLogo: true,
        showVatNumber: true,
        showQrCode: true,
        invoiceNumberFormat: 'ORD-{YYYYMMDD}-{####}',
        receiptTemplate: 'thermal' as 'thermal' | 'a4',
        customTemplate: null,
      },
      paymentMethods: {
        enableCash: true,
        enableCard: true,
        enableZainCash: false,
        enableAsiaHawala: false,
        enableBankTransfer: false,
        paymentGatewayConfig: {},
      },
      printers: {
        printers: [],
        autoPrint: false,
        numberOfCopies: 1,
        paperSize: '80mm',
      },
      tax: {
        enableTaxSystem: false,
        taxCalculationMethod: 'excluded' as 'included' | 'excluded',
        taxApplicationType: 'order' as 'order' | 'category' | 'item',
        applyTaxOnDelivery: false,
        applyTaxOnServiceCharge: false,
        applyTaxOnReservations: false,
      },
    };
  }

  /**
   * Get a specific setting category
   */
  async getSettingCategory(tenantId: string, category: string, branchId?: string, language: string = 'en') {
    const settings = await this.getSettings(tenantId, branchId, language);
    return settings[category] || null;
  }
}

