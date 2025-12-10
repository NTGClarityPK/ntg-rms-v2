import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Get all settings for a tenant
   * Settings are stored as JSON in tenant_settings table
   */
  async getSettings(tenantId: string) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Check if settings exist
    const { data: existing, error: fetchError } = await supabase
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

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
    return {
      general: { ...defaults.general, ...(existing.general || {}) },
      invoice: { ...defaults.invoice, ...(existing.invoice || {}) },
      paymentMethods: {
        ...defaults.paymentMethods,
        ...(existing.payment_methods || {}),
      },
      printers: { ...defaults.printers, ...(existing.printers || {}) },
      tax: { ...defaults.tax, ...(existing.tax || {}) },
    };
  }

  /**
   * Update settings for a tenant
   */
  async updateSettings(tenantId: string, updateDto: UpdateSettingsDto) {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Get current settings
    const current = await this.getSettings(tenantId);

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
    const { data, error } = await supabase
      .from('tenant_settings')
      .upsert(
        {
          tenant_id: tenantId,
          general: updated.general,
          invoice: updated.invoice,
          payment_methods: updated.payment_methods,
          printers: updated.printers,
          tax: updated.tax,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'tenant_id',
        }
      )
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to update settings: ${error.message}`
      );
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
  async getSettingCategory(tenantId: string, category: string) {
    const settings = await this.getSettings(tenantId);
    return settings[category] || null;
  }
}

