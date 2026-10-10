import { ChevronDown, ExternalLink, LogOut, Menu, Plus, X } from 'lucide-react';
import { KeyboardEvent, RefObject, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { ButtonLink, LanguageSwitch, Logo, RouteFallback } from '../components/ui';
import { TKey, useT } from '../i18n';
import { appApi } from './api';
import { useActiveJobCount } from './jobs';
import './app.css';

/** Pages inside the shell. The Viewer keeps its own full-screen layout and opens in a new tab. */
const NAV: Array<{ to: string; label: TKey; end: boolean }> = [
  { to: '/app', label: 'shell.nav.dashboard', end: true },
  { to: '/app/data', label: 'shell.nav.data', end: false },
  { to: '/app/projects', label: 'shell.nav.projects', end: false },
  { to: '/app/jobs', label: 'shell.nav.jobs', end: false },
  { to: '/app/analysis/fusion', label: 'shell.nav.fusion', end: false },
];
const ACTIVE_JOBS_HREF = `/app/jobs?status=${encodeURIComponent('QUEUED,RUNNING')}`;
const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled)';

/** Closes a popover on Escape or a pointer press outside `refs`; focus returns to `trigger` on Escape. */
function useDismiss(open: boolean, close: () => void, refs: Array<RefObject<HTMLElement | null>>, trigger: RefObject<HTMLElement | null>) {
  const refsRef = useRef(refs);
  refsRef.current = refs;
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent | MouseEvent) => {
      const target = event.target as Node;
      if (refsRef.current.some((ref) => ref.current?.contains(target))) return;
      close();
      // Clicking empty space (or the scrim) hands focus back; clicking another control keeps it there.
      if (!(target instanceof Element && target.closest(FOCUSABLE))) trigger.current?.focus();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      close();
      trigger.current?.focus();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open, close, trigger]);
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  return (
    <>
      {NAV.map(({ to, label, end }) => (
        <NavLink key={to} to={to} end={end} className="app-top__link" onClick={onNavigate}>{t(label)}</NavLink>
      ))}
      <a className="app-top__link" href="/app/viewer" target="_blank" rel="noopener noreferrer" onClick={onNavigate}>
        Viewer<ExternalLink size={13} aria-hidden className="app-top__ext" /><span className="sr-only">{t('shell.newTab')}</span>
      </a>
    </>
  );
}

/** Signed-in layout for /app pages (S2–S6, S10, S12): a 48px top bar like the Viewer's, then the page. */
export default function AppShell() {
  const { user, signOut } = useAuth();
  const t = useT();
  const name = user?.name ?? t('shell.userFallback');
  const activeJobs = useActiveJobCount();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const accountButton = useRef<HTMLButtonElement>(null);
  const accountPanel = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closeAccount = useCallback(() => setAccountOpen(false), []);
  useDismiss(menuOpen, closeMenu, [sheet, menuButton], menuButton);
  useDismiss(accountOpen, closeAccount, [accountPanel, accountButton], accountButton);

  // A new page closes both popovers.
  useEffect(() => { setMenuOpen(false); setAccountOpen(false); }, [location.pathname]);
  // The sheet takes focus when it opens.
  useEffect(() => { if (menuOpen) sheet.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus(); }, [menuOpen]);

  /** Keeps Tab inside the open sheet (it covers the page). */
  const trapSheet = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || !sheet.current) return;
    const items = Array.from(sheet.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const jobsState = activeJobs ? (
    <Link className="app-top__jobs" to={ACTIVE_JOBS_HREF} aria-label={t('shell.runningJobs', { count: activeJobs })}>
      <span className="app-top__jobs-dot" aria-hidden />{t('shell.running')} <span className="num">{activeJobs}</span>
    </Link>
  ) : null;

  return (
    <div className={`xc app${menuOpen ? ' app--menu-open' : ''}`}>
      <a className="skip-link" href="#app-main">{t('common.skipToContent')}</a>
      <header className="app-top">
        <span className="app-top__brand"><Logo to="/app" label={t('shell.brand')} /></span>
        <nav className="app-top__nav" aria-label={t('shell.mainNav')}><NavItems /></nav>
        <div className="app-top__end">
          {jobsState}
          <ButtonLink to="/app/data/new" size="sm" className="app-top__add"><Plus size={14} aria-hidden />{t('shell.addData')}</ButtonLink>
          <div className="app-account">
            <button
              ref={accountButton}
              type="button"
              className="app-account__button"
              aria-expanded={accountOpen}
              aria-controls="app-account-panel"
              onClick={() => setAccountOpen((value) => !value)}
            >
              <span className="app-account__initial" aria-hidden>{name.slice(0, 1)}</span>
              <span className="app-account__name">{name}</span>
              <span className="sr-only">{t('shell.accountMenu')}</span>
              <ChevronDown size={14} aria-hidden />
            </button>
            {accountOpen && (
              <div ref={accountPanel} id="app-account-panel" className="app-account__panel">
                <p className="app-account__who"><strong>{name}</strong>{appApi.demo && <small>{t('shell.demo')}</small>}</p>
                <div className="app-account__lang"><LanguageSwitch block /></div>
                <button type="button" className="app-account__item" onClick={signOut}><LogOut size={15} aria-hidden />{t('common.logout')}</button>
              </div>
            )}
          </div>
          <button
            ref={menuButton}
            type="button"
            className="xc-icon-btn app-top__menu"
            aria-label={t(menuOpen ? 'common.closeMenu' : 'common.openMenu')}
            aria-expanded={menuOpen}
            aria-controls="app-menu"
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </div>
      </header>

      {menuOpen && (
        <>
          <div className="app-sheet__scrim" aria-hidden />
          <div ref={sheet} id="app-menu" className="app-sheet" role="dialog" aria-modal="true" aria-label={t('shell.menu')} onKeyDown={trapSheet}>
            <nav className="app-sheet__nav" aria-label={t('shell.menuItems')}><NavItems onNavigate={closeMenu} /></nav>
            <div className="app-sheet__actions">
              <ButtonLink to="/app/data/new" block onClick={closeMenu}><Plus size={16} aria-hidden />{t('shell.addData')}</ButtonLink>
            </div>
            <LanguageSwitch block />
            <div className="app-sheet__account">
              <span className="app-account__who"><strong>{name}</strong>{appApi.demo && <small>{t('shell.demo')}</small>}</span>
              <button type="button" className="xc-btn xc-btn--line xc-btn--sm" onClick={signOut}><LogOut size={15} aria-hidden />{t('common.logout')}</button>
            </div>
          </div>
        </>
      )}

      <main id="app-main" className="app-main" tabIndex={-1}>
        {/* Pages download on first visit; the top bar stays while one loads. */}
        <Suspense fallback={<RouteFallback inline />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
