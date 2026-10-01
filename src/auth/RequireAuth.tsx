import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Button, StatusScreen } from '../components/ui';
import { useAuth } from './AuthProvider';

/** Guards /app/* routes: waits for session restore, then sends anonymous users to /login?redirect=… */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, status, retry, endReason } = useAuth();
  const location = useLocation();
  if (status === 'checking') return <StatusScreen busy title="로그인 상태를 확인하고 있습니다…" />;
  if (status === 'unavailable') {
    return (
      <StatusScreen
        role="alert"
        title="서버에 연결할 수 없습니다"
        text="인증 서버 실행 상태를 확인한 뒤 다시 시도해 주세요."
        action={<Button onClick={retry}>다시 시도</Button>}
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
