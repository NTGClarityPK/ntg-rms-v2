import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private client: SupabaseClient;
  private serviceRoleClient: SupabaseClient;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const supabaseUrl = 
      this.configService.get<string>('SUPABASE_URL') || 
      this.configService.get<string>('supabase.url');
    const supabaseAnonKey = 
      this.configService.get<string>('SUPABASE_ANON_KEY') || 
      this.configService.get<string>('supabase.anonKey');
    const supabaseServiceRoleKey = 
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') || 
      this.configService.get<string>('supabase.serviceRoleKey');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error('Supabase configuration is missing. Please check your .env.local or .env file.');
    }

    // Client with anon key (for RLS)
    this.client = createClient(supabaseUrl, supabaseAnonKey);

    // Client with service role key (bypasses RLS - use carefully)
    this.serviceRoleClient = createClient(supabaseUrl, supabaseServiceRoleKey);
  }

  getClient(): SupabaseClient {
    return this.client;
  }

  getServiceRoleClient(): SupabaseClient {
    return this.serviceRoleClient;
  }

  /**
   * Set tenant context for RLS policies
   * Note: RLS policies are enforced at the database level.
   * For service role client, RLS is bypassed, so we need to manually filter by tenant_id in queries.
   * For regular client, RLS policies will automatically filter based on the authenticated user's tenant_id.
   */
  async setTenantContext(tenantId: string, isSuperAdmin = false): Promise<void> {
    // RLS policies handle tenant isolation automatically
    // This method is kept for future use if we need to set session variables
    // For now, tenant filtering should be done in service layer queries
  }
}

