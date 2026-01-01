import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';

export interface Role {
  id: string;
  name: string;
  displayNameEn: string;
  displayNameAr?: string;
  description?: string;
  isSystemRole: boolean;
  isActive: boolean;
  permissions?: Permission[];
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  description?: string;
}

export interface UserRole {
  id: string;
  userId: string;
  roleId: string;
  role?: Role;
  assignedAt: string;
  assignedBy?: string;
}

@Injectable()
export class RolesService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Get all roles
   */
  async getRoles(): Promise<Role[]> {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data: roles, error } = await supabase
      .from('roles')
      .select('*')
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch roles: ${error.message}`);
    }

    return (roles || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      displayNameEn: r.display_name_en,
      displayNameAr: r.display_name_ar,
      description: r.description,
      isSystemRole: r.is_system_role,
      isActive: r.is_active,
    }));
  }

  /**
   * Get role by ID with permissions
   */
  async getRoleById(roleId: string): Promise<Role> {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data: role, error } = await supabase
      .from('roles')
      .select(
        `
        *,
        role_permissions(
          permission:permissions(*)
        )
      `,
      )
      .eq('id', roleId)
      .is('deleted_at', null)
      .single();

    if (error || !role) {
      throw new NotFoundException(`Role with ID ${roleId} not found`);
    }

    return {
      id: role.id,
      name: role.name,
      displayNameEn: role.display_name_en,
      displayNameAr: role.display_name_ar,
      description: role.description,
      isSystemRole: role.is_system_role,
      isActive: role.is_active,
      permissions: (role.role_permissions || []).map((rp: any) => ({
        id: rp.permission.id,
        resource: rp.permission.resource,
        action: rp.permission.action,
        description: rp.permission.description,
      })),
    };
  }

  /**
   * Get all permissions
   */
  async getPermissions(): Promise<Permission[]> {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data: permissions, error } = await supabase
      .from('permissions')
      .select('*')
      .order('resource', { ascending: true })
      .order('action', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch permissions: ${error.message}`);
    }

    return (permissions || []).map((p: any) => ({
      id: p.id,
      resource: p.resource,
      action: p.action,
      description: p.description,
    }));
  }

  /**
   * Get user roles
   */
  async getUserRoles(userId: string): Promise<UserRole[]> {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data: userRoles, error } = await supabase
      .from('user_roles')
      .select(
        `
        *,
        role:roles(*)
      `,
      )
      .eq('user_id', userId)
      .order('assigned_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch user roles: ${error.message}`);
    }

    return (userRoles || []).map((ur: any) => ({
      id: ur.id,
      userId: ur.user_id,
      roleId: ur.role_id,
      assignedAt: ur.assigned_at,
      assignedBy: ur.assigned_by,
      role: ur.role
        ? {
            id: ur.role.id,
            name: ur.role.name,
            displayNameEn: ur.role.display_name_en,
            displayNameAr: ur.role.display_name_ar,
            description: ur.role.description,
            isSystemRole: ur.role.is_system_role,
            isActive: ur.role.is_active,
          }
        : undefined,
    }));
  }

  /**
   * Get user permissions (aggregated from all roles)
   */
  async getUserPermissions(userId: string): Promise<Permission[]> {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Use the database function to get user permissions
    const { data, error } = await supabase.rpc('get_user_permissions', {
      user_uuid: userId,
    });

    if (error) {
      throw new InternalServerErrorException(`Failed to fetch user permissions: ${error.message}`);
    }

    // Get full permission details
    const permissionKeys = (data || []).map((p: any) => ({ resource: p.resource, action: p.action }));
    if (permissionKeys.length === 0) {
      return [];
    }

    const { data: permissions, error: permError } = await supabase
      .from('permissions')
      .select('*')
      .in(
        'resource',
        permissionKeys.map((k: any) => k.resource),
      );

    if (permError) {
      throw new InternalServerErrorException(`Failed to fetch permission details: ${permError.message}`);
    }

    // Filter to only include permissions the user has
    const userPerms = (permissions || []).filter((p: any) =>
      permissionKeys.some((k: any) => k.resource === p.resource && k.action === p.action),
    );

    return userPerms.map((p: any) => ({
      id: p.id,
      resource: p.resource,
      action: p.action,
      description: p.description,
    }));
  }

  /**
   * Check if user has a specific permission
   */
  async userHasPermission(userId: string, resource: string, action: string): Promise<boolean> {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { data, error } = await supabase.rpc('user_has_permission', {
      user_uuid: userId,
      resource_name: resource,
      action_name: action,
    });

    if (error) {
      throw new InternalServerErrorException(`Failed to check permission: ${error.message}`);
    }

    return data === true;
  }

  /**
   * Assign roles to user
   */
  async assignRolesToUser(userId: string, roleIds: string[], assignedBy: string): Promise<UserRole[]> {
    const supabase = this.supabaseService.getServiceRoleClient();

    // Validate roles exist
    const { data: existingRoles, error: rolesError } = await supabase
      .from('roles')
      .select('id')
      .in('id', roleIds)
      .is('deleted_at', null)
      .eq('is_active', true);

    if (rolesError) {
      throw new InternalServerErrorException(`Failed to validate roles: ${rolesError.message}`);
    }

    if (existingRoles.length !== roleIds.length) {
      throw new BadRequestException('One or more roles not found or inactive');
    }

    // Remove existing roles
    const { error: deleteError } = await supabase.from('user_roles').delete().eq('user_id', userId);

    if (deleteError) {
      throw new InternalServerErrorException(`Failed to remove existing roles: ${deleteError.message}`);
    }

    // Insert new roles
    const userRolesToInsert = roleIds.map((roleId) => ({
      user_id: userId,
      role_id: roleId,
      assigned_by: assignedBy,
    }));

    const { data: insertedRoles, error: insertError } = await supabase
      .from('user_roles')
      .insert(userRolesToInsert)
      .select(
        `
        *,
        role:roles(*)
      `,
      );

    if (insertError) {
      throw new InternalServerErrorException(`Failed to assign roles: ${insertError.message}`);
    }

    return (insertedRoles || []).map((ur: any) => ({
      id: ur.id,
      userId: ur.user_id,
      roleId: ur.role_id,
      assignedAt: ur.assigned_at,
      assignedBy: ur.assigned_by,
      role: ur.role
        ? {
            id: ur.role.id,
            name: ur.role.name,
            displayNameEn: ur.role.display_name_en,
            displayNameAr: ur.role.display_name_ar,
            description: ur.role.description,
            isSystemRole: ur.role.is_system_role,
            isActive: ur.role.is_active,
          }
        : undefined,
    }));
  }

  /**
   * Remove all roles from user
   */
  async removeAllRolesFromUser(userId: string): Promise<void> {
    const supabase = this.supabaseService.getServiceRoleClient();

    const { error } = await supabase.from('user_roles').delete().eq('user_id', userId);

    if (error) {
      throw new InternalServerErrorException(`Failed to remove roles: ${error.message}`);
    }
  }
}







