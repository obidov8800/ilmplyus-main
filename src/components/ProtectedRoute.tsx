import { Navigate, Outlet } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import { useMeSync } from '../hooks/useMeSync';

const ProtectedRoute = () => {
  const isAuth = useAuthStore((state) => state.isAuth);

  // Rol/ruxsatlar: sahifa chizilishidan OLDIN serverdan olinadi (marshrut tekshiruvi va menyu `permissionsLoaded`ni
  // kutadi). Keyin tinmasdan so'ralmaydi — qarang `hooks/useMeSync.ts`.
  useMeSync();

  if (!isAuth) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
