import { useAuthStore } from '../store/auth-store';
import { hasPermission, canView, canCreate, canUpdate, canDelete } from '../utils/permissions';

/**
 * Hook to check user permissions
 */
export function usePermissions() {
  const { user } = useAuthStore();
  const permissions = user?.permissions || [];
  const userRole = user?.role;

  return {
    permissions,
    hasPermission: (resource: string, action: string) =>
      hasPermission(permissions, resource, action, userRole),
    canView: (resource: string) => canView(permissions, resource, userRole),
    canCreate: (resource: string) => canCreate(permissions, resource, userRole),
    canUpdate: (resource: string) => canUpdate(permissions, resource, userRole),
    canDelete: (resource: string) => canDelete(permissions, resource, userRole),
  };
}





