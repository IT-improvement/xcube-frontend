// Whether the server can send mail (UR-63 F6, public `GET /auth/mail-status`): the sign-up page shows the contact
// e-mail field and the password pages offer reset only when it can. Kept apart from accountMail so the sign-in pages
// in the main bundle load only this.
import { useMockApi } from './index';
import { request } from './httpClient';
import { AUTH_API_BASE_URL } from './authApi';

export type MailStatus = { mailEnabled: boolean; passwordResetEnabled: boolean };
/** A plain address check before the server's own (INVALID_EMAIL, max 254). */
export const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function mailStatus(): Promise<MailStatus> {
  if (useMockApi) return new Promise((resolve) => window.setTimeout(() => resolve({ mailEnabled: true, passwordResetEnabled: true }), 100));
  return request<MailStatus>(AUTH_API_BASE_URL, '/api/v1/auth/mail-status', {}, false);
}
