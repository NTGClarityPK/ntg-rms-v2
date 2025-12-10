import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.tenant_id) {
      return false;
    }

    // Set tenant context for RLS policies
    await this.supabaseService.setTenantContext(user.tenant_id, user.role === 'super_admin');

    return true;
  }
}

