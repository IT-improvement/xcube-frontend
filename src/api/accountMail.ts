// Contact e-mail, password reset and self-delete (UR-63 F6). Contract: docs/PM/codex-prompts/FX-contract.md "F6",
// field names from FX-B-report.md: the login id is still `email` on /users/me, the contact address is `contactEmail`
// (verified only), the sign-up body takes an optional `contactEmail` and answers `pendingEmail`. The public
// `GET /auth/mail-status` tells the screens whether to offer password reset and the e-mail field at all.
import { useMockApi } from './index';
import { ApiError, request, session } from './httpClient';
import { AUTH_API_BASE_URL, authSession } from './authApi';
import { EMAIL_RULE, mailStatus } from './mailStatus';
export { EMAIL_RULE };
export type { MailStatus } from './mailStatus';

/** GET/PUT/POST /users/me/email: the verified address and the one waiting for its code. */
export type ContactEmail = {
  email: string | null;
  verified: boolean;
  verifiedAt?: string | null;
  pendingEmail: string | null;
  pendingExpiresAt?: string | null;
  attemptsLeft?: number | null;
  mailEnabled: boolean;
};

/** Six digits, as the server sends them. */
export const CODE_RULE = /^\d{6}$/;

// ---- Demo (REACT_APP_USE_MOCK_API): mail is on, the code is always 123456.
export const DEMO_CODE = '123456';
const pause = (ms = 300) => new Promise((resolve) => window.setTimeout(resolve, ms));
const demo: { contact: ContactEmail } = { contact: { email: null, verified: false, pendingEmail: null, attemptsLeft: null, mailEnabled: true } };

export const accountMail = {
  mailStatus,
  contact(): Promise<ContactEmail> {
    if (useMockApi) return pause(150).then(() => ({ ...demo.contact }));
    return request<ContactEmail>(AUTH_API_BASE_URL, '/api/v1/users/me/email');
  },
  /** 202: a six-digit code goes to `email` (10 minutes, 5 tries). */
  startVerification(email: string): Promise<ContactEmail> {
    if (useMockApi) return pause().then(() => {
      if (!EMAIL_RULE.test(email)) throw new ApiError(400, 'INVALID_EMAIL', '이메일 주소 형식이 올바르지 않습니다.', undefined, { max: 254 });
      demo.contact = { ...demo.contact, pendingEmail: email.toLowerCase(), attemptsLeft: 5 };
      return { ...demo.contact };
    });
    return request<ContactEmail>(AUTH_API_BASE_URL, '/api/v1/users/me/email', { method: 'PUT', body: JSON.stringify({ email }) });
  },
  verify(code: string): Promise<ContactEmail> {
    if (useMockApi) return pause().then(() => {
      if (!demo.contact.pendingEmail) throw new ApiError(400, 'CODE_NOT_FOUND', '보낸 인증 코드가 없습니다.');
      if (code !== DEMO_CODE) {
        const left = Math.max(0, (demo.contact.attemptsLeft ?? 5) - 1);
        demo.contact = { ...demo.contact, attemptsLeft: left };
        if (!left) { demo.contact = { ...demo.contact, pendingEmail: null }; throw new ApiError(400, 'CODE_ATTEMPTS_EXCEEDED', '인증 코드를 너무 많이 틀렸습니다.'); }
        throw new ApiError(400, 'CODE_INVALID', '인증 코드가 맞지 않습니다.', undefined, { attemptsLeft: left });
      }
      demo.contact = { ...demo.contact, email: demo.contact.pendingEmail, verified: true, verifiedAt: new Date().toISOString(), pendingEmail: null, attemptsLeft: null };
      return { ...demo.contact };
    });
    return request<ContactEmail>(AUTH_API_BASE_URL, '/api/v1/users/me/email/verify', { method: 'POST', body: JSON.stringify({ code }) });
  },
  remove(): Promise<void> {
    if (useMockApi) return pause().then(() => { demo.contact = { ...demo.contact, email: null, verified: false, pendingEmail: null, attemptsLeft: null }; });
    return request<void>(AUTH_API_BASE_URL, '/api/v1/users/me/email', { method: 'DELETE' });
  },
  /** Always 202 with no body (it never says whether the account exists); 503 MAIL_DISABLED when mail is off. */
  requestReset(loginIdOrEmail: string): Promise<void> {
    if (useMockApi) return pause().then(() => undefined);
    return request<void>(AUTH_API_BASE_URL, '/api/v1/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ loginIdOrEmail }) }, false);
  },
  /** 204; every session of the account is signed out. */
  confirmReset(token: string, newPassword: string): Promise<void> {
    if (useMockApi) return pause().then(() => { if (token === 'used') throw new ApiError(400, 'RESET_TOKEN_USED', '이미 쓴 링크입니다.'); });
    return request<void>(AUTH_API_BASE_URL, '/api/v1/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ token, newPassword }) }, false);
  },
  /** 204 and the refresh cookie is cleared; the local session ends here too. */
  async deleteMe(input: { password: string; confirmLoginId: string }): Promise<void> {
    if (useMockApi) {
      await pause();
      if (input.password === 'wrong-password') throw new ApiError(400, 'CURRENT_PASSWORD_INCORRECT', '현재 비밀번호가 맞지 않습니다.');
    } else {
      await request<void>(AUTH_API_BASE_URL, '/api/v1/users/me', { method: 'DELETE', body: JSON.stringify(input), credentials: 'include' });
    }
    session.clear();
    authSession.clear();
  },
};
