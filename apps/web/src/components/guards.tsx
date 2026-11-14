import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ROLE_HOME, type Role } from '@lms/shared';
import { useAuthStore } from '../store/authStore';

/** Any signed-in user. */
export function RequireAuth() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Signed-in user with one of the given roles. The API checks the role again on every request. */
export function RequireRole({ roles }: { roles: Role[] }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  return <Outlet />;
}

/** Login and register pages bounce signed-in users to their own home. */
export function RedirectIfSignedIn({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (user) {
    return <Navigate to={user.mustChangePassword ? '/change-password' : ROLE_HOME[user.role]} replace />;
  }
  return <>{children}</>;
}

export function HomeRedirect() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.mustChangePassword ? '/change-password' : ROLE_HOME[user.role]} replace />;
}
