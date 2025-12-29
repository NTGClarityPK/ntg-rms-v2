import { useAuthStore } from '../store/auth-store';
import { hasPermission, canView, canCreate, canUpdate, canDelete } from '../utils/permissions';

/**
 * Hook to check user permissions
 */
export function usePermissions() {
  const { user } = useAuthStore();
  const permissions = user?.permissions || [];

  return {
    permissions,
    hasPermission: (resource: string, action: string) =>
      hasPermission(permissions, resource, action),
    canView: (resource: string) => canView(permissions, resource),
    canCreate: (resource: string) => canCreate(permissions, resource),
    canUpdate: (resource: string) => canUpdate(permissions, resource),
    canDelete: (resource: string) => canDelete(permissions, resource),
  };
}





