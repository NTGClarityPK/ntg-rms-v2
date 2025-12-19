import { Permission } from '../api/roles';

/**
 * Check if user has a specific permission
 */
export function hasPermission(
  userPermissions: Permission[] | undefined,
  resource: string,
  action: string,
): boolean {
  if (!userPermissions || userPermissions.length === 0) {
    return false;
  }

  return userPermissions.some((perm) => perm.resource === resource && perm.action === action);
}

/**
 * Check if user can view a resource
 */
export function canView(userPermissions: Permission[] | undefined, resource: string): boolean {
  return hasPermission(userPermissions, resource, 'view');
}

/**
 * Check if user can create a resource
 */
export function canCreate(userPermissions: Permission[] | undefined, resource: string): boolean {
  return hasPermission(userPermissions, resource, 'create');
}

/**
 * Check if user can update a resource
 */
export function canUpdate(userPermissions: Permission[] | undefined, resource: string): boolean {
  return hasPermission(userPermissions, resource, 'update');
}

/**
 * Check if user can delete a resource
 */
export function canDelete(userPermissions: Permission[] | undefined, resource: string): boolean {
  return hasPermission(userPermissions, resource, 'delete');
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

