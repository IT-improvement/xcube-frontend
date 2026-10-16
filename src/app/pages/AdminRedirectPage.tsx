import { useEffect } from 'react';
import { useRoleGate } from '../../auth/roles';
import { RouteFallback } from '../../components/ui';
import { adminConsoleUrl } from '../adminConsole';
import AppNotFoundPage from './AppNotFoundPage';

/**
 * The old S13 address /app/admin (UR-59). The admin screens moved to the admin console (UR-62): admins are sent
 * there (replace, so Back does not bounce them here again); every other account sees the normal /app 404.
 */
export default function AdminRedirectPage() {
  const { isAdmin } = useRoleGate();
  useEffect(() => {
    if (isAdmin) window.location.replace(adminConsoleUrl());
  }, [isAdmin]);
  return isAdmin ? <RouteFallback inline /> : <AppNotFoundPage />;
}
