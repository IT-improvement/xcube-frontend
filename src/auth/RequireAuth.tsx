import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Button, StatusScreen } from '../components/ui';
import { useT } from '../i18n';
import { useAuth } from './AuthProvider';

/** Guards /app/* routes: waits for session restore, then sends anonymous users to /login?redirect=… */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, status, retry, endReason } = useAuth();
  const location = useLocation();
  const t = useT();
  if (status === 'checking') return <StatusScreen busy title={t('route.checkingSession')} />;
  if (status === 'unavailable') {
    return (
      <StatusScreen
        role="alert"
        title={t('route.unavailableTitle')}
        text={t('route.unavailableText')}
        action={<Button onClick={retry}>{t('common.retry')}</Button>}
      />
    );
  }
  if (!user) {
    if (endReason === 'idle') return <Navigate to="/login?reason=idle" replace />;
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  return <>{children}</>;
}
