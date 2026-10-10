/* Screen language (UR-53 stage 1): detection, dictionaries, switching and where the switch lives. */
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import en from './en';
import ko from './ko';
import enApp from './app/en';
import koApp from './app/ko';
import enWizard from './wizard/en';
import koWizard from './wizard/ko';
import enViewer from './viewer/en';
import koViewer from './viewer/ko';
import { detectLanguage, formatDate, formatDateTime, formatNumber, pickLanguage, STORAGE_KEY, translate } from './core';
import { LanguageProvider } from './LanguageProvider';

const mockMe = jest.fn(); const mockRefresh = jest.fn(); const mockLastActivity = jest.fn();
jest.mock('../api/authApi', () => ({
  LAST_ACTIVITY_KEY: 'xcube-last-activity',
  authSession: { lastActivity: () => mockLastActivity(), touch: jest.fn(), clear: jest.fn() },
  authApi: { me: () => mockMe(), refresh: () => mockRefresh(), login: jest.fn(), signup: jest.fn(), logout: jest.fn() },
}));
jest.mock('../views/Viewer', () => ({ __esModule: true, default: () => <div>Viewer</div> }));
jest.mock('../app/jobs', () => ({ useActiveJobCount: () => 1 }));

const App = require('../App').default;

function setBrowserLanguages(languages: string[]) {
  Object.defineProperty(window.navigator, 'languages', { value: languages, configurable: true });
  Object.defineProperty(window.navigator, 'language', { value: languages[0], configurable: true });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLastActivity.mockReturnValue(0);
  window.history.replaceState({}, '', '/');
});
afterEach(() => {
  setBrowserLanguages(['ko-KR', 'ko']);
  document.documentElement.lang = 'ko';
});

describe('처음 언어 정하기', () => {
  test('브라우저 언어 목록에서 지원하는 첫 언어를 고르고, 없으면 영어, 목록이 없으면 한국어', () => {
    expect(pickLanguage(['ko-KR'])).toBe('ko');
    expect(pickLanguage(['ko'])).toBe('ko');
    expect(pickLanguage(['en-GB'])).toBe('en');
    expect(pickLanguage(['fr'])).toBe('en');
    expect(pickLanguage(['fr-FR', 'ko-KR'])).toBe('ko');
    expect(pickLanguage(['en-US', 'ko-KR'])).toBe('en');
    expect(pickLanguage([])).toBe('ko');
    expect(pickLanguage(undefined)).toBe('ko');
  });

  test('navigator를 읽고, 저장된 선택이 있으면 그것이 이긴다', () => {
    setBrowserLanguages(['ko-KR']);
    expect(detectLanguage()).toBe('ko');
    setBrowserLanguages(['en-GB']);
    expect(detectLanguage()).toBe('en');
    setBrowserLanguages(['fr']);
    expect(detectLanguage()).toBe('en');
    localStorage.setItem(STORAGE_KEY, 'ko');
    expect(detectLanguage()).toBe('ko');
    localStorage.setItem(STORAGE_KEY, 'de');
    expect(detectLanguage()).toBe('en');
  });

  test('영어 브라우저로 처음 오면 소개 홈이 영어로 열리고 <html lang>이 en이 된다', () => {
    setBrowserLanguages(['en-US', 'en']);
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Keep satellite imagery small.');
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('XCube — Satellite data, smaller, on a map');
  });
});

describe('사전', () => {
  type Tree = { [key: string]: string | Tree };
  const isPlural = (value: unknown) => typeof value === 'object' && value !== null && 'other' in value;
  /** key → every text form (a plural gives its one/other texts). */
  function flatten(tree: Tree, prefix = ''): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const [key, value] of Object.entries(tree)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'string') out.set(path, [value]);
      else if (isPlural(value)) out.set(path, Object.values(value) as string[]);
      else flatten(value, path).forEach((texts, inner) => out.set(inner, texts));
    }
    return out;
  }
  const placeholders = (texts: string[]) => Array.from(new Set(texts.flatMap((text) => text.match(/\{\w+\}/g) ?? []))).sort();

  test('ko와 en은 같은 키를 가지고, 같은 자리표시자를 쓰며, 빈 문장이 없다', () => {
    // Every part: the main dictionary, the app part (management screens, UR-53 stage 2), the wizard part
    // (stage 3) and the Viewer part (stage 4).
    const koKeys = flatten({ ...ko, ...koApp, ...koWizard, ...koViewer } as unknown as Tree);
    const enKeys = flatten({ ...en, ...enApp, ...enWizard, ...enViewer } as unknown as Tree);
    expect(Object.keys(koApp).filter((name) => name in ko)).toEqual([]);
    expect(Object.keys(koWizard).filter((name) => name in ko || name in koApp)).toEqual([]);
    expect(Object.keys(koViewer).filter((name) => name in ko || name in koApp || name in koWizard)).toEqual([]);
    expect(Array.from(enKeys.keys()).sort()).toEqual(Array.from(koKeys.keys()).sort());
    koKeys.forEach((texts, key) => {
      const english = enKeys.get(key)!;
      // A plural form may drop {count} (e.g. "one job"), so compare without it.
      const strip = (list: string[]) => placeholders(list).filter((name) => name !== '{count}');
      expect([key, strip(english)]).toEqual([key, strip(texts)]);
      [...texts, ...english].forEach((text) => expect([key, text.trim().length > 0]).toEqual([key, true]));
    });
  });

  test('자리표시자를 채우고, 영어는 개수에 따라 단수·복수를 고른다', () => {
    expect(translate('ko', 'shell.runningJobs', { count: 1 })).toBe('처리 중인 작업 1개');
    expect(translate('en', 'shell.runningJobs', { count: 1 })).toBe('1 job running');
    expect(translate('en', 'shell.runningJobs', { count: 3 })).toBe('3 jobs running');
    expect(translate('en', 'titles.dataNamed', { name: 'Daecheong' })).toBe('Daecheong · Data');
    expect(translate('en', 'common.show', {})).toBe('Show {label}');
  });

  test('날짜·숫자 형식: 한국어는 지금과 같은 모양, 영어는 미국식', () => {
    const date = new Date(2024, 7, 14, 14, 5);
    expect(formatDate(date, {}, 'ko')).toBe(date.toLocaleDateString('ko-KR'));
    expect(formatDate(date, {}, 'ko')).toBe('2024. 8. 14.');
    expect(formatDate(date, {}, 'en')).toBe('8/14/2024');
    expect(formatDate(date, { year: 'numeric', month: 'long', day: 'numeric' }, 'ko')).toBe('2024년 8월 14일');
    expect(formatDate(date, { year: 'numeric', month: 'long', day: 'numeric' }, 'en')).toBe('August 14, 2024');
    expect(formatDateTime(date, 'ko')).toBe('8. 14. 14:05');
    expect(formatDateTime(date, 'en')).toBe('8/14, 14:05');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('not a date')).toBe('not a date');
    expect(formatNumber(12345.6, {}, 'ko')).toBe('12,345.6');
    expect(formatNumber(12345.6, {}, 'en')).toBe('12,345.6');
  });
});

describe('언어 바꾸기', () => {
  test('소개 홈에서 English를 누르면 글자, <html lang>, 탭 제목이 바뀌고 선택이 저장된다', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('위성 영상은 작게 보관하고');
    expect(document.documentElement.lang).toBe('ko');
    expect(document.title).toBe('XCube — 위성 데이터를 작게, 지도에서');

    const [header] = screen.getAllByRole('group', { name: '언어' });
    expect(within(header).getByRole('button', { name: '한국어' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(header).getByRole('button', { name: 'English' }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Keep satellite imagery small. Open only the places and dates you need, on a map.');
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent))
      .toEqual(['What changes', 'Daecheong Lake, one scene from start to finish', 'Who it’s for', 'How it runs']);
    expect(screen.getByText(/Daecheong Lake, August 14, 2024, Sentinel-1\/2/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /The actual XCube Viewer/ })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('XCube — Satellite data, smaller, on a map');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('en');
    screen.getAllByRole('group', { name: 'Language' }).forEach((group) =>
      expect(within(group).getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true'));

    fireEvent.click(screen.getAllByRole('button', { name: '한국어' })[0]);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('위성 영상은 작게 보관하고');
    expect(document.documentElement.lang).toBe('ko');
  });

  test('로그인 화면: 전환하면 제목·입력 이름·검증 문장과 탭 제목이 바뀐다', () => {
    window.history.replaceState({}, '', '/login');
    render(<App />);
    expect(document.title).toBe('로그인 · XCube');
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect(screen.getByText('아이디를 입력하세요.')).toBeInTheDocument();

    const group = screen.getByRole('group', { name: '언어' });
    fireEvent.click(within(group).getByRole('button', { name: 'English' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByText('Enter your username.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Password' })).toBeInTheDocument();
    expect(screen.getByText('Daecheong Lake, August 14, 2024 · original and AI result')).toBeInTheDocument();
    expect(document.title).toBe('Sign in · XCube');
  });

  test('회원가입 화면에도 전환이 있고, 저장된 영어 선택으로 열린다', () => {
    localStorage.setItem(STORAGE_KEY, 'en');
    window.history.replaceState({}, '', '/signup');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Create account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
    expect(document.title).toBe('Create account · XCube');
  });

  test('없는 주소(공개 404)도 영어로 바뀐다', () => {
    localStorage.setItem(STORAGE_KEY, 'en');
    window.history.replaceState({}, '', '/nowhere');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
    expect(document.title).toBe('Page not found · XCube');
  });
});

describe('관리 화면 상단 바', () => {
  const AppShell = require('../app/AppShell').default;
  const { AuthProvider } = require('../auth/AuthProvider');

  function renderShell() {
    mockLastActivity.mockReturnValue(Date.now());
    mockRefresh.mockResolvedValue({ accessToken: 'token' });
    mockMe.mockResolvedValue({ id: 1, name: '홍길동' });
    return render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/app']}>
          <AuthProvider>
            <Routes>
              <Route path="/app" element={<AppShell />}>
                <Route index element={<h1>본문</h1>} />
              </Route>
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </LanguageProvider>,
    );
  }

  test('계정 메뉴와 모바일 메뉴에 언어 전환이 있고, 고르면 상단 바가 영어가 된다', async () => {
    renderShell();
    const account = await screen.findByRole('button', { name: /홍길동/ });
    fireEvent.click(account);
    // Only the account panel is open, so its switch is the one on screen.
    const group = screen.getByRole('group', { name: '언어' });
    fireEvent.click(within(group).getByRole('button', { name: 'English' }));

    const nav = screen.getByRole('navigation', { name: 'Main menu' });
    expect(within(nav).getAllByRole('link').map((link) => link.textContent))
      .toEqual(['Dashboard', 'Data', 'Projects', 'Jobs', 'Band math', 'Viewer(new tab)']);
    expect(screen.getByRole('link', { name: '1 job running' })).toHaveTextContent('Running 1');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const sheet = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(sheet).getByRole('group', { name: 'Language' })).toBeInTheDocument();
  });
});

describe('Viewer 계정 메뉴', () => {
  const UserMenu = require('../views/Viewer/UserMenu').default;

  test('한국어·English 항목이 있고, 고르면 언어가 저장되고 메뉴 글자도 바뀐다 (4단계)', () => {
    render(<LanguageProvider><UserMenu name="홍길동" theme="light" onToggleTheme={jest.fn()} onLogout={jest.fn()} /></LanguageProvider>);
    fireEvent.click(screen.getByRole('button', { name: '홍길동 계정 메뉴' }));
    const korean = screen.getByRole('menuitemradio', { name: '한국어' });
    expect(korean).toHaveAttribute('aria-checked', 'true');
    expect(korean).toHaveAttribute('lang', 'ko');
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'English' }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    fireEvent.click(screen.getByRole('button', { name: '홍길동 account menu' }));
    expect(screen.getByRole('menuitemradio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menu', { name: 'Account' })).toHaveTextContent('Signed in');
    expect(screen.getByRole('menuitem', { name: /Switch to dark mode/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Sign out 홍길동' })).toHaveTextContent('Sign out');
  });
});
