/* Account roles (UR-59): order, labels, and the reason the screens and a 403 ROLE_FORBIDDEN show. */
import { ApiError, userMessage } from '../api/httpClient';
import { accountRoleLabel, roleAtLeast, roleReason, toAccountRole } from './roles';

test('등급 값은 대소문자를 가리지 않고, 모르는 값은 null', () => {
  expect(toAccountRole('PROJECT_USER')).toBe('PROJECT_USER');
  expect(toAccountRole(' admin ')).toBe('ADMIN');
  expect(toAccountRole('OWNER')).toBeNull();
  expect(toAccountRole(undefined)).toBeNull();
});

test('USER < PROJECT_USER < PROJECT_MANAGER < ADMIN, 모르는 등급은 막지 않는다(서버가 막는다)', () => {
  expect(roleAtLeast('USER', 'PROJECT_USER')).toBe(false);
  expect(roleAtLeast('PROJECT_USER', 'PROJECT_USER')).toBe(true);
  expect(roleAtLeast('PROJECT_USER', 'PROJECT_MANAGER')).toBe(false);
  expect(roleAtLeast('PROJECT_MANAGER', 'PROJECT_USER')).toBe(true);
  expect(roleAtLeast('ADMIN', 'PROJECT_MANAGER')).toBe(true);
  expect(roleAtLeast(null, 'ADMIN')).toBe(true);
});

test('등급 이름과 이유 문장은 한국어·영어 짝이 있다', () => {
  expect(accountRoleLabel('PROJECT_MANAGER', 'ko')).toBe('프로젝트 관리자');
  expect(accountRoleLabel('USER', 'en')).toBe('User');
  expect(accountRoleLabel('SOMETHING', 'ko')).toBe('SOMETHING');
  expect(roleReason('PROJECT_USER', 'ko')).toBe('관리자에게 프로젝트 유저 등급을 요청하세요.');
  expect(roleReason('PROJECT_MANAGER', 'en')).toBe('Ask an admin for the Project manager role.');
});

test('서버 403 ROLE_FORBIDDEN은 params.required에 맞는 같은 문장, required가 없으면 일반 문장', () => {
  expect(userMessage(new ApiError(403, 'ROLE_FORBIDDEN', 'forbidden', undefined, { required: 'PROJECT_USER' }), 'ko')).toBe('관리자에게 프로젝트 유저 등급을 요청하세요.');
  expect(userMessage(new ApiError(403, 'ROLE_FORBIDDEN', 'forbidden', undefined, { required: 'PROJECT_MANAGER' }), 'en')).toBe('Ask an admin for the Project manager role.');
  expect(userMessage(new ApiError(403, 'ROLE_FORBIDDEN', 'forbidden'), 'ko')).toBe('지금 등급에서는 할 수 없는 작업입니다. 관리자에게 등급을 요청하세요.');
});
