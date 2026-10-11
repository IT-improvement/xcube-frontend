// Demo (REACT_APP_USE_MOCK_API=true) stand-in for the account settings APIs (S11): the auth service's profile
// and password calls and the Backoffice storage usage. Same codes as the real services. Real mode never uses this.
import { ApiError } from '../api/httpClient';
import type { ProfileUpdate, User } from '../api/authApi';
import type { StorageUsage } from '../api/backofficeApi';

const GIB = 1024 ** 3;
const pause = (ms = 350) => new Promise((resolve) => window.setTimeout(resolve, ms));
/** The demo has no stored password: any current password is accepted except this one, to try the error. */
export const DEMO_WRONG_PASSWORD = 'wrong-password';

export const accountDemo = {
  async updateProfile(input: ProfileUpdate): Promise<Partial<User>> {
    await pause();
    if (input.name === undefined && input.language === undefined) throw new ApiError(400, 'NOTHING_TO_UPDATE', '바꿀 내용이 없습니다.');
    const name = input.name?.trim();
    if (name !== undefined && (!name || name.length > 50)) throw new ApiError(400, 'INVALID_NAME', '이름은 1자 이상 50자 이하로 입력하세요.', undefined, { min: 1, max: 50 });
    return { ...(name !== undefined ? { name } : {}), ...(input.language !== undefined ? { language: input.language } : {}) };
  },
  async changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
    await pause();
    if (input.currentPassword === DEMO_WRONG_PASSWORD) throw new ApiError(400, 'CURRENT_PASSWORD_INCORRECT', '현재 비밀번호가 맞지 않습니다.');
    if (input.newPassword.length < 8 || input.newPassword.length > 100) throw new ApiError(400, 'PASSWORD_POLICY', '새 비밀번호는 8자 이상 100자 이하로 입력하세요.', undefined, { min: 8, max: 100 });
    if (input.newPassword === input.currentPassword) throw new ApiError(400, 'PASSWORD_UNCHANGED', '새 비밀번호가 지금 비밀번호와 같습니다.');
  },
  async storageUsage(): Promise<StorageUsage> {
    await pause(200);
    const byKind = { ORIGINAL: 9.5 * GIB, FUSION: 2.25 * GIB, AI_RESULT: 0.75 * GIB };
    return { usedBytes: byKind.ORIGINAL + byKind.FUSION + byKind.AI_RESULT, quotaBytes: 50 * GIB, datasetCount: 12, unknownSizeCount: 1, byKind };
  },
};
