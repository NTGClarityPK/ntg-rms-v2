// Application types
export type Language = 'en' | 'ar';

export interface Tenant {
  id: string;
  name: string;
  subdomain: string;
}

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  code: string;
}

