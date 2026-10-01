import { Database, ExternalLink, FolderKanban, LayoutDashboard, LogOut, Map, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../components/ui';
import { appApi } from './api';
import './app.css';

const NAV = [
  { to: '/app', label: '대시보드', icon: LayoutDashboard, end: true },
  { to: '/app/data', label: '데이터', icon: Database, end: false },
  { to: '/app/projects', label: '프로젝트', icon: FolderKanban, end: false },
];

/** Signed-in layout for /app pages (S2–S6). The Viewer keeps its own full-screen layout. */
export default function AppShell() {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMenuOpen(false), [location.pathname]);
  const name = user?.name ?? '사용자';
  return (
    <div className={`xc app ${menuOpen ? 'app--menu-open' : ''}`}>
      <a className="skip-link" href="#app-main">본문으로 건너뛰기</a>
      <aside className="app-nav" aria-label="주 메뉴">
        <div className="app-nav__head">
          <Logo to="/app" />
          <button type="button" className="xc-icon-btn app-nav__close" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)}>
            <X size={18} aria-hidden />
          </button>
        </div>
        <nav className="app-nav__links">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="app-nav__link">
              <Icon size={18} aria-hidden />
              {label}
            </NavLink>
          ))}
          <a className="app-nav__link" href="/app/viewer" target="_blank" rel="noopener noreferrer">
            <Map size={18} aria-hidden />
            Viewer
            <ExternalLink size={14} aria-hidden className="app-nav__ext" />
            <span className="sr-only">(새 탭)</span>
          </a>
          <p className="app-nav__section">분석</p>
          <span className="app-nav__link is-disabled" aria-disabled="true" title="M6에서 제공">수식 융합<em>준비 중</em></span>
          <span className="app-nav__link is-disabled" aria-disabled="true" title="M7에서 제공">AI 수체 추출<em>준비 중</em></span>
        </nav>
        <div className="app-nav__user">
          <span className="app-nav__avatar" aria-hidden>{name.slice(0, 1)}</span>
          <span className="app-nav__name">
            <strong>{name}</strong>
            {appApi.demo && <small>데모 모드</small>}
          </span>
          <button type="button" className="xc-icon-btn" onClick={signOut} aria-label={`${name} 로그아웃`} title="로그아웃">
            <LogOut size={18} aria-hidden />
          </button>
        </div>
      </aside>
      <div className="app-nav__scrim" aria-hidden onClick={() => setMenuOpen(false)} />
      <div className="app-body">
        <header className="app-mobile-bar">
          <button type="button" className="xc-icon-btn" aria-label="메뉴 열기" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <Menu size={20} aria-hidden />
          </button>
          <Logo to="/app" />
        </header>
        <main id="app-main" className="app-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
