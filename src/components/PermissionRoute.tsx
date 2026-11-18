import { Navigate, Outlet } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';

interface PermissionRouteProps {
  /** Bitta majburiy ruxsat. */
  permission?: string;
  /**
   * Bir nechta resursni birlashtirgan sahifalar uchun — ro'yxatdagi
   * ruxsatlardan kamida bittasi bo'lsa marshrut ochiladi.
   */
  anyOf?: string[];
}

const PermissionRoute = ({ permission, anyOf }: PermissionRouteProps) => {
  const permissions = useAuthStore((state) => state.permissions);
  const permissionsLoaded = useAuthStore((state) => state.permissionsLoaded);

  if (!permissionsLoaded) {
    return null;
  }

  const required = anyOf ?? (permission ? [permission] : []);
  const hasPermission = required.length === 0 || required.some((p) => permissions.includes(p));

  if (!hasPermission) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

export default PermissionRoute;
