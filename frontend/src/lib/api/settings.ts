import apiClient from './client';
import { API_ENDPOINTS } from '../constants/api';
import { getApiLanguage } from '../hooks/use-api-language';

export interface GeneralSettings {
  defaultLanguage?: string;
  defaultCurrency?: string;
  dateFormat?: string;
  timeFormat?: '12' | '24';
  firstDayOfWeek?: string;
  defaultOrderType?: string;
  autoPrintInvoices?: boolean;
  autoPrintKitchenTickets?: boolean;
  enableTableManagement?: boolean;
  enableDeliveryManagement?: boolean;
  minimumDeliveryOrderAmount?: number;
  emailNotifications?: boolean;
  smsNotifications?: boolean;
  soundAlerts?: boolean;
  totalTables?: number;
}

export interface InvoiceSettings {
  headerText?: string;
  footerText?: string;
  termsAndConditions?: string;
  showLogo?: boolean;
  showVatNumber?: boolean;
  showQrCode?: boolean;
  invoiceNumberFormat?: string;
  receiptTemplate?: 'thermal' | 'a4';
  customTemplate?: string;
}

export interface PaymentMethodSettings {
  enableCash?: boolean;
  enableCard?: boolean;
  enableZainCash?: boolean;
  enableAsiaHawala?: boolean;
  enableBankTransfer?: boolean;
  paymentGatewayConfig?: Record<string, any>;
}

export interface Printer {
  id?: string;
  name: string;
  type: 'receipt' | 'kitchen' | 'invoice';
  connectionType: 'usb' | 'network' | 'bluetooth';
  ipAddress?: string;
  counterId?: string;
}

export interface PrinterSettings {
  printers?: Printer[];
  autoPrint?: boolean;
  numberOfCopies?: number;
  paperSize?: string;
}

export interface TaxSettings {
  enableTaxSystem?: boolean;
  taxCalculationMethod?: 'included' | 'excluded';
  taxApplicationType?: 'order' | 'category' | 'item';
  applyTaxOnDelivery?: boolean;
  applyTaxOnServiceCharge?: boolean;
  applyTaxOnReservations?: boolean;
}

export interface Settings {
  general: GeneralSettings;
  invoice: InvoiceSettings;
  paymentMethods: PaymentMethodSettings;
  printers: PrinterSettings;
  tax: TaxSettings;
}

export interface UpdateSettingsDto {
  general?: GeneralSettings;
  invoice?: InvoiceSettings;
  paymentMethods?: PaymentMethodSettings;
  printers?: PrinterSettings;
  tax?: TaxSettings;
}

export const settingsApi = {
  /**
   * Get all settings
   */
  getSettings: async (branchId?: string, language?: string): Promise<Settings> => {
    const lang = language || getApiLanguage();
    const params: any = { language: lang };
    if (branchId) params.branchId = branchId;
    const response = await apiClient.get(API_ENDPOINTS.SETTINGS, { params });
    return response.data;
  },

  /**
   * Get a specific settings category
   */
  getSettingCategory: async (category: string, branchId?: string, language?: string): Promise<any> => {
    const lang = language || getApiLanguage();
    const params: any = { language: lang };
    if (branchId) params.branchId = branchId;
    const response = await apiClient.get(`${API_ENDPOINTS.SETTINGS}/${category}`, { params });
    return response.data;
  },

  /**
   * Update settings
   */
  updateSettings: async (data: UpdateSettingsDto, branchId?: string, language?: string): Promise<Settings> => {
    const lang = language || getApiLanguage();
    const params: any = { language: lang };
    if (branchId) params.branchId = branchId;
    const response = await apiClient.put(API_ENDPOINTS.SETTINGS, data, { params });
    return response.data;
  },
};

