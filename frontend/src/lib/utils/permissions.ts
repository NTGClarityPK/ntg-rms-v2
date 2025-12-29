import { Permission } from '../api/roles';

/**
 * Check if user has a specific permission
 */
export function hasPermission(
  userPermissions: Permission[] | undefined,
  resource: string,
  action: string,
  userRole?: string,
): boolean {
  // Owners have full access to everything
  if (userRole === 'tenant_owner') {
    return true;
  }

  if (!userPermissions || userPermissions.length === 0) {
    return false;
  }

  return userPermissions.some((perm) => perm.resource === resource && perm.action === action);
}

/**
 * Check if user can view a resource
 */
export function canView(userPermissions: Permission[] | undefined, resource: string, userRole?: string): boolean {
  return hasPermission(userPermissions, resource, 'view', userRole);
}

/**
 * Check if user can create a resource
 */
export function canCreate(userPermissions: Permission[] | undefined, resource: string, userRole?: string): boolean {
  return hasPermission(userPermissions, resource, 'create', userRole);
}

/**
 * Check if user can update a resource
 */
export function canUpdate(userPermissions: Permission[] | undefined, resource: string, userRole?: string): boolean {
  return hasPermission(userPermissions, resource, 'update', userRole);
}

/**
 * Check if user can delete a resource
 */
export function canDelete(userPermissions: Permission[] | undefined, resource: string, userRole?: string): boolean {
  return hasPermission(userPermissions, resource, 'delete', userRole);
}

/**
 * Get all permissions for a specific resource
 */
export function getResourcePermissions(
  userPermissions: Permission[] | undefined,
  resource: string,
): Permission[] {
  if (!userPermissions) {
    return [];
  }

  return userPermissions.filter((perm) => perm.resource === resource);
}





