// Admin console (UR-62, AO-contract "일반 frontend 쪽 변경"): a separate app (xcube-admin-frontend) served at /admin.
// The 관리자 menu entry and the old /app/admin address hand admins over to it with a full page load (not a router link).

/**
 * Where the admin console lives. `REACT_APP_ADMIN_URL` wins when set (the deployment builds with `/admin`, the
 * same origin; local development points it at the console's own dev server). Without it: `/admin` in a production
 * build, and port 3010 on the host this page was opened from in development.
 */
export function adminConsoleUrl(env: string | undefined = process.env.REACT_APP_ADMIN_URL, production = process.env.NODE_ENV === 'production'): string {
  const configured = env?.trim();
  if (configured) return configured;
  if (production) return '/admin';
  return `${window.location.protocol}//${window.location.hostname}:3010/admin`;
}
