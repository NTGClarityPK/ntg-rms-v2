import { ReactNode } from 'react';
import { usePermissions } from '@/lib/hooks/use-permissions';

interface PermissionGuardProps {
  resource: string;
  action: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Component that only renders children if user has the required permission
 */
export function PermissionGuard({ resource, action, children, fallback = null }: PermissionGuardProps) {
  const { hasPermission } = usePermissions();

  if (!hasPermission(resource, action)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}






