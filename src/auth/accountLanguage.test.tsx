/* S11 language rule: this browser's choice → the account's language → the browser languages; a choice is saved to the account while signed in. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { LanguageSwitch } from '../components/ui';
import { LanguageProvider, STORAGE_KEY, useLanguage } from '../i18n';
import { AuthProvider, useAuth } from './AuthProvider';

const mockMe = jest.fn(); const mockUpdateMe = jest.fn(); const mockLastActivity = jest.fn();
jest.mock('../api/authApi', () => ({
  LAST_ACTIVITY_KEY: 'xcube-last-activity',
  authSession: { lastActivity: () => mockLastActivity(), touch: jest.fn(), clear: jest.fn() },
  authApi: { me: () => mockMe(), updateMe: (input: unknown) => mockUpdateMe(input), refresh: jest.fn().mockResolvedValue({}), logout: jest.fn().mockResolvedValue(undefined) },
}));

const account = (language: 'ko' | 'en' | null) => ({ id: 7, email: 'hong', name: '홍길동', role: 'USER', status: 'ACTIVE', language });

function Probe() {
  const { lang } = useLanguage();
  const { user, signIn, signOut } = useAuth();
  return (
    <div>
      <p data-testid="lang">{lang}</p>
      <p data-testid="who">{user ? `${user.name}:${user.language ?? '-'}` : 'signed out'}</p>
      <LanguageSwitch />
      <button type="button" onClick={() => signIn(account('en'))}>sign in</button>
      <button type="button" onClick={signOut}>sign out</button>
    </div>
  );
}
const renderApp = () => render(<LanguageProvider><MemoryRouter><AuthProvider><Probe /></AuthProvider></MemoryRouter></LanguageProvider>);
const saved = () => localStorage.getItem(STORAGE_KEY);

beforeEach(() => {
  jest.clearAllMocks();
  mockLastActivity.mockReturnValue(0);
  mockUpdateMe.mockImplementation(async (input: { language: 'ko' | 'en' }) => account(input.language));
});

test('로그인한 동안 언어를 바꾸면 이 브라우저와 계정에 함께 저장한다', async () => {
  mockLastActivity.mockReturnValue(Date.now());
  mockMe.mockResolvedValue(account(null));
  renderApp();
  await screen.findByText('홍길동:-');
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  expect(screen.getByTestId('lang')).toHaveTextContent('en');
  expect(saved()).toBe('en');
  expect(mockUpdateMe).toHaveBeenCalledWith({ language: 'en' });
  expect(await screen.findByText('홍길동:en')).toBeInTheDocument();
});

test('로그인하지 않았으면 이 브라우저에만 저장하고 계정 API를 부르지 않는다', async () => {
  renderApp();
  await screen.findByText('signed out');
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  expect(saved()).toBe('en');
  expect(mockUpdateMe).not.toHaveBeenCalled();
});

test('로그아웃한 뒤의 선택은 계정에 보내지 않는다', async () => {
  mockLastActivity.mockReturnValue(Date.now());
  mockMe.mockResolvedValue(account(null));
  renderApp();
  await screen.findByText('홍길동:-');
  fireEvent.click(screen.getByRole('button', { name: 'sign out' }));
  await screen.findByText('signed out');
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  expect(mockUpdateMe).not.toHaveBeenCalled();
});

test('계정 저장에 실패해도 조용히 넘어가고 이 브라우저의 선택은 남는다', async () => {
  mockLastActivity.mockReturnValue(Date.now());
  mockMe.mockResolvedValue(account(null));
  mockUpdateMe.mockRejectedValue(new Error('offline'));
  renderApp();
  await screen.findByText('홍길동:-');
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  await waitFor(() => expect(mockUpdateMe).toHaveBeenCalled());
  expect(screen.getByTestId('lang')).toHaveTextContent('en');
  expect(saved()).toBe('en');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

describe('로그인할 때 언어 순서: 이 브라우저의 선택 → 계정 → 브라우저 언어', () => {
  test('저장된 선택이 없으면 계정 언어를 보여 주되, 이 브라우저의 선택으로 저장하지 않는다', async () => {
    renderApp();
    expect(screen.getByTestId('lang')).toHaveTextContent('ko'); // browser language (setupTests: ko-KR)
    mockLastActivity.mockReturnValue(Date.now()); // the login just touched the activity clock
    fireEvent.click(screen.getByRole('button', { name: 'sign in' }));
    await waitFor(() => expect(screen.getByTestId('lang')).toHaveTextContent('en'));
    expect(saved()).toBeNull();
    expect(mockUpdateMe).not.toHaveBeenCalled();
  });

  test('이 브라우저에 저장된 선택이 계정보다 먼저다', async () => {
    localStorage.setItem(STORAGE_KEY, 'ko');
    renderApp();
    mockLastActivity.mockReturnValue(Date.now()); // the login just touched the activity clock
    fireEvent.click(screen.getByRole('button', { name: 'sign in' }));
    await screen.findByText('홍길동:en');
    expect(screen.getByTestId('lang')).toHaveTextContent('ko');
  });

  test('세션을 되살릴 때도 계정 언어를 쓰고, 계정 값이 없으면 브라우저 언어 그대로', async () => {
    mockLastActivity.mockReturnValue(Date.now());
    mockMe.mockResolvedValue(account('en'));
    const { unmount } = renderApp();
    await screen.findByText('홍길동:en');
    await waitFor(() => expect(screen.getByTestId('lang')).toHaveTextContent('en'));
    expect(saved()).toBeNull();
    unmount();

    mockMe.mockResolvedValue(account(null));
    renderApp();
    await screen.findByText('홍길동:-');
    expect(screen.getByTestId('lang')).toHaveTextContent('ko');
  });
});
