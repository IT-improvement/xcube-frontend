import { LogOut, Mail, Menu, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Button, ButtonAnchor, ButtonLink, LanguageSwitch, Logo } from '../components/ui';
import './landing.css';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useLanguage } from '../i18n';
import { caseDate } from './caseDate';

const CONTACT_EMAIL = process.env.REACT_APP_CONTACT_EMAIL;
const VERSION = process.env.REACT_APP_VERSION;
const ASSET = `${process.env.PUBLIC_URL ?? ''}/landing`;

const NAV = [
  { href: '#case', key: 'landing.nav.case' },
  { href: '#customers', key: 'landing.nav.customers' },
  { href: '#adopt', key: 'landing.nav.adopt' },
] as const;

/** "무엇이 달라지나": three ruled lines. Only what is built today. Texts: landing.change.<id>. */
const CHANGES = ['store', 'open', 'ai'] as const;
/** What the result panel in the case capture shows, top to bottom. Texts: landing.case.<id>. */
const CASE_READING = ['swipe', 'threshold', 'metrics', 'csv'] as const;
const CUSTOMERS = ['enterprise', 'local'] as const;
const CUSTOMER_ITEMS = ['item1', 'item2', 'item3'] as const;
const ADOPT = ['start', 'location', 'format', 'account', 'pending'] as const;

const MOBILE_QUERY = '(max-width: 767px)';
const VIEWER_PATH = '/app/viewer';
/** Visitors who are not signed in go through login and land on the Viewer afterwards (UR-51). */
const VIEWER_LOGIN = `/login?redirect=${encodeURIComponent(VIEWER_PATH)}`;

export default function LandingPage() {
  useDocumentTitle();
  const { lang, t } = useLanguage();
  const date = caseDate(lang);
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback((returnFocus = true) => {
    setMenuOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  }, []);

  // The bar sits transparent over the hero and takes a sheet + rule once the page moves.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Mobile menu: focus the first link on open; Escape or a click outside closes it.
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeMenu(); };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !toggleRef.current?.contains(target)) closeMenu(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [menuOpen, closeMenu]);

  // Leaving the phone layout with the menu open would leave it stuck open in the desktop bar.
  useEffect(() => {
    if (!menuOpen || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(MOBILE_QUERY);
    const onChange = () => { if (!query.matches) setMenuOpen(false); };
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, [menuOpen]);

  const viewerTo = user ? VIEWER_PATH : VIEWER_LOGIN;

  const actions = (inMenu: boolean) => user ? (
    <>
      <ButtonLink to={viewerTo} variant={inMenu ? 'line' : 'quiet'} size={inMenu ? 'lg' : 'md'} block={inMenu}>{t('landing.actions.openViewer')}</ButtonLink>
      <ButtonLink to="/app" variant="ink" size={inMenu ? 'lg' : 'md'} block={inMenu}>{t('landing.actions.toConsole')}</ButtonLink>
      <Button variant={inMenu ? 'line' : 'quiet'} size={inMenu ? 'lg' : 'md'} block={inMenu} onClick={() => { setMenuOpen(false); signOut(); }}>
        <LogOut size={16} aria-hidden />{t('common.logout')}
      </Button>
    </>
  ) : (
    <>
      <ButtonLink to="/login?redirect=%2F" variant={inMenu ? 'line' : 'quiet'} size={inMenu ? 'lg' : 'md'} block={inMenu}>{t('landing.actions.login')}</ButtonLink>
      <ButtonLink to={viewerTo} variant={inMenu ? 'line' : 'quiet'} size={inMenu ? 'lg' : 'md'} block={inMenu}>{t('landing.actions.openViewer')}</ButtonLink>
      <ButtonLink to="/signup" variant="ink" size={inMenu ? 'lg' : 'md'} block={inMenu}>{t('landing.actions.start')}</ButtonLink>
    </>
  );

  return (
    <div className="xc landing">
      <a className="skip-link" href="#main">{t('common.skipToContent')}</a>
      <header className="lp-bar" data-scrolled={scrolled || menuOpen ? 'true' : undefined}>
        <div className="lp-wrap lp-bar__inner">
          <Logo />
          <nav aria-label={t('landing.nav.main')} className="lp-bar__nav">
            <ul>
              {NAV.map((item) => <li key={item.href}><a href={item.href}>{t(item.key)}</a></li>)}
            </ul>
          </nav>
          <div className="lp-bar__actions"><LanguageSwitch className="lp-bar__lang" />{actions(false)}</div>
          <button
            ref={toggleRef}
            type="button"
            className="lp-bar__toggle"
            aria-label={t(menuOpen ? 'common.closeMenu' : 'common.openMenu')}
            aria-expanded={menuOpen}
            aria-controls="lp-menu"
            onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
          >
            {menuOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </div>
        <div ref={menuRef} id="lp-menu" className="lp-menu" data-open={menuOpen ? 'true' : undefined} inert={!menuOpen}>
          <nav aria-label={t('landing.nav.mobile')}>
            <ul>
              {NAV.map((item) => <li key={item.href}><a href={item.href} onClick={() => closeMenu(false)}>{t(item.key)}</a></li>)}
            </ul>
          </nav>
          <div className="lp-menu__actions">{actions(true)}</div>
          <LanguageSwitch block />
        </div>
      </header>

      <main id="main">
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-wrap lp-hero__copy">
            <h1 id="hero-title" className="lp-hero__title">{t('landing.hero.title')}</h1>
            <div className="lp-hero__side">
              <p className="lp-hero__lead">{t('landing.hero.lead')}</p>
              <div className="lp-cta">
                {user
                  ? <ButtonLink to="/app" variant="ink" size="lg">{t('landing.actions.toConsole')}</ButtonLink>
                  : <ButtonLink to="/signup" variant="ink" size="lg">{t('landing.actions.start')}</ButtonLink>}
                <ButtonLink to={viewerTo} variant="line" size="lg">{t('landing.actions.openViewer')}</ButtonLink>
                {!user && <ButtonAnchor href="#adopt" variant="quiet" size="lg">{t('landing.nav.adopt')}</ButtonAnchor>}
              </div>
            </div>
          </div>
          <figure className="lp-hero__shot">
            <picture>
              <source media={MOBILE_QUERY} srcSet={`${ASSET}/daecheong-swipe.webp`} width={780} height={1148} />
              <img
                src={`${ASSET}/daecheong-viewer.webp`}
                width={2400}
                height={1016}
                alt={t('landing.hero.alt')}
                fetchPriority="high"
              />
            </picture>
            <figcaption className="lp-wrap lp-caption">
              {t('landing.hero.caption', { date })}
            </figcaption>
          </figure>
        </section>

        <section className="lp-change" aria-labelledby="change-title">
          <div className="lp-wrap">
            <h2 id="change-title" className="lp-h2">{t('landing.change.title')}</h2>
            <ul className="lp-lines">
              {CHANGES.map((id) => (
                <li key={id} className="lp-line">
                  <h3 className="lp-line__title">{t(`landing.change.${id}.title`)}</h3>
                  <div className="lp-line__body">
                    <p>{t(`landing.change.${id}.text`)}</p>
                    <p className="lp-line__note">{t(`landing.change.${id}.note`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="case" className="lp-case" aria-labelledby="case-title">
          <div className="lp-wrap lp-case__grid">
            <div className="lp-case__copy">
              <h2 id="case-title" className="lp-h2">{t('landing.case.title')}</h2>
              <p className="lp-case__lead">{t('landing.case.lead', { date })}</p>
              <ol className="lp-reading">
                {CASE_READING.map((id) => (
                  <li key={id}>
                    <h3>{t(`landing.case.${id}.title`)}</h3>
                    <p>{t(`landing.case.${id}.text`)}</p>
                  </li>
                ))}
              </ol>
              <p className="lp-fine">{t('landing.case.fine')}</p>
            </div>
            <figure className="lp-case__shot">
              <Link to={viewerTo} className="lp-case__link" aria-label={t('landing.case.link')}>
                <img
                  src={`${ASSET}/daecheong-result.webp`}
                  width={666}
                  height={1280}
                  loading="lazy"
                  decoding="async"
                  alt={t('landing.case.alt')}
                />
              </Link>
              <figcaption className="lp-caption">{t('landing.case.caption')}</figcaption>
            </figure>
          </div>
        </section>

        <section id="customers" className="lp-customers" aria-labelledby="customers-title">
          <div className="lp-wrap">
            <h2 id="customers-title" className="lp-h2">{t('landing.customers.title')}</h2>
            <div className="lp-customers__cols">
              {CUSTOMERS.map((id) => (
                <article key={id} className="lp-customer" aria-labelledby={`customer-${id}`}>
                  <h3 id={`customer-${id}`} className="lp-customer__title">{t(`landing.customers.${id}.title`)}</h3>
                  <p className="lp-customer__lead">{t(`landing.customers.${id}.lead`)}</p>
                  <ul className="lp-customer__items">
                    {CUSTOMER_ITEMS.map((item) => <li key={item}>{t(`landing.customers.${id}.${item}`)}</li>)}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="adopt" className="lp-adopt" aria-labelledby="adopt-title">
          <div className="lp-wrap lp-adopt__grid">
            <div className="lp-adopt__head">
              <h2 id="adopt-title" className="lp-h2">{t('landing.adopt.title')}</h2>
              <p className="lp-adopt__lead">{t('landing.adopt.lead')}</p>
              <div className="lp-cta">
                {user
                  ? <ButtonLink to="/app" variant="ink" size="lg">{t('landing.actions.toConsole')}</ButtonLink>
                  : <ButtonLink to="/signup" variant="ink" size="lg">{t('landing.actions.start')}</ButtonLink>}
                <ButtonLink to={viewerTo} variant="line" size="lg">{t('landing.actions.openViewer')}</ButtonLink>
                {CONTACT_EMAIL && (
                  <ButtonAnchor href={`mailto:${CONTACT_EMAIL}`} variant="line" size="lg">
                    <Mail size={18} aria-hidden />{t('landing.actions.contact')}
                  </ButtonAnchor>
                )}
              </div>
            </div>
            <dl className="lp-facts">
              {ADOPT.map((id) => (
                <div key={id} className="lp-fact">
                  <dt>{t(`landing.adopt.${id}.title`)}</dt>
                  <dd>{t(`landing.adopt.${id}.text`)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer__inner">
          <Logo />
          <p className="lp-footer__credit">{t('landing.footer.credit')}</p>
          <p className="lp-footer__meta">
            <span>© {new Date().getFullYear()} XCube</span>
            {VERSION && <span className="tabular">{t('landing.footer.version', { version: VERSION })}</span>}
          </p>
          <LanguageSwitch />
        </div>
      </footer>
    </div>
  );
}
