// Account roles (UR-59, docs/PM/codex-prompts/ADM-contract.md §1): USER < PROJECT_USER < PROJECT_MANAGER < ADMIN.
// The server checks the least role on every request (403 ROLE_FORBIDDEN); the screens only disable what the
// role cannot do and say why, so nothing here is a security boundary.
import { useAuth } from './AuthProvider';
import { useLanguage } from '../i18n';
import { translate } from '../i18n/core';
import type { Lang } from '../i18n/types';

export const ACCOUNT_ROLES = ['USER', 'PROJECT_USER', 'PROJECT_MANAGER', 'ADMIN'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

/** A role value from the server ("project_user" is accepted); anything else is null (unknown). */
export function toAccountRole(value: unknown): AccountRole | null {
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return (ACCOUNT_ROLES as readonly string[]).includes(upper) ? (upper as AccountRole) : null;
}

const rank = (role: AccountRole) => ACCOUNT_ROLES.indexOf(role);

/**
 * True when `role` is `least` or above. An unknown role (no user, an older server without the four roles)
 * does not lock anything: the server still answers 403 with a reason, which the screens show.
 */
export const roleAtLeast = (role: AccountRole | null | undefined, least: AccountRole) => role == null || rank(role) >= rank(least);

/** 유저 · 프로젝트 유저 · 프로젝트 관리자 · 관리자 / User · Project user · Project manager · Admin. Unknown values as given. */
export const accountRoleLabel = (role: unknown, lang: Lang) => {
  const known = toAccountRole(role);
  return known ? translate(lang, `accountRole.name.${known}`) : String(role ?? '—');
};

/** "관리자에게 프로젝트 유저 등급을 요청하세요." for what needs `least`. */
export const roleReason = (least: AccountRole, lang: Lang) =>
  translate(lang, least === 'ADMIN' ? 'accountRole.reason.ADMIN' : least === 'PROJECT_MANAGER' ? 'accountRole.reason.PROJECT_MANAGER' : 'accountRole.reason.PROJECT_USER');

/** What each action needs (contract §2 "Generation · Analysis · AI" and §3). */
export const NEEDS: { createData: AccountRole; manageProjects: AccountRole; admin: AccountRole } = {
  /** Add data (files, products, Shapefile, GEE, Zarr path), band math, AI extraction, retry, delete my data, link to a project. */
  createData: 'PROJECT_USER',
  /** Create, edit, delete and share projects. */
  manageProjects: 'PROJECT_MANAGER',
  admin: 'ADMIN',
};

/** The signed-in user's role, or null outside an AuthProvider (the Viewer in tests) or when the server sent none. */
export function useAccountRole(): AccountRole | null {
  return toAccountRole(readUser()?.role);
}
/**
 * useAuth reads the context on every render (always the same one hook call); it only throws, after reading, when
 * there is no provider. Called through this alias so the throw can be caught without breaking the hook order rule.
 */
const readContext = useAuth;
function readUser(): { role?: unknown } | null | undefined {
  try { return readContext().user; } catch { return null; }
}

/** `can(need)` and the sentence to show next to what is disabled. */
export function useRoleGate() {
  const role = useAccountRole();
  const { lang } = useLanguage();
  return {
    role,
    isAdmin: role === 'ADMIN',
    can: (least: AccountRole) => roleAtLeast(role, least),
    /** Empty when allowed. */
    reason: (least: AccountRole) => (roleAtLeast(role, least) ? '' : roleReason(least, lang)),
  };
}
