// Application types
export type Language = 'en' | 'ar';

export interface Tenant {
  id: string;
  nameEn: string;
  nameAr?: string;
  subdomain: string;
}

export interface Branch {
  id: string;
  tenantId: string;
  nameEn: string;
  nameAr?: string;
  code: string;
}

