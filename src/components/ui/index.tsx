import { AlertCircle, CheckCircle2, Eye, EyeOff, Info, TriangleAlert } from 'lucide-react';
import { AnchorHTMLAttributes, ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, useEffect, useId, useState } from 'react';
import { Link, LinkProps } from 'react-router-dom';
import { useT } from '../../i18n';
import './ui.css';

export { LanguageSwitch } from './LanguageSwitch';

/** ink = primary, line = secondary, quiet = ghost (DESIGN.md names; the old names stay as aliases). */
type Variant = 'ink' | 'line' | 'quiet' | 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';
type ButtonStyle = { variant?: Variant; size?: Size; block?: boolean };

function buttonClass({ variant = 'ink', size = 'md', block }: ButtonStyle, extra?: string) {
  return ['xc-btn', `xc-btn--${variant}`, size !== 'md' && `xc-btn--${size}`, block && 'xc-btn--block', extra]
    .filter(Boolean)
    .join(' ');
}

export function Button({ variant, size, block, className, type = 'button', ...props }: ButtonStyle & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={buttonClass({ variant, size, block }, className)} {...props} />;
}

/** In-app navigation styled as a button. */
export function ButtonLink({ variant, size, block, className, ...props }: ButtonStyle & LinkProps) {
  return <Link className={buttonClass({ variant, size, block }, className)} {...props} />;
}

/** External or new-tab navigation styled as a button. */
export function ButtonAnchor({ variant, size, block, className, children, ...props }: ButtonStyle & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={buttonClass({ variant, size, block }, className)} {...props}>{children}</a>;
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; help?: string; error?: string };

export function TextField({ label, help, error, type = 'text', id, className, ...props }: TextFieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  // While an error shows, it replaces the help line (the help usually repeats the same rule).
  const showHelp = !!help && !error;
  const describedBy = [showHelp && `${inputId}-help`, error && `${inputId}-error`].filter(Boolean).join(' ') || undefined;
  const [revealed, setRevealed] = useState(false);
  const t = useT();
  const isPassword = type === 'password';
  return (
    <div className={['xc-field', error && 'xc-field--invalid', className].filter(Boolean).join(' ')}>
      <label className="xc-field__label" htmlFor={inputId}>{label}</label>
      <div className="xc-field__control">
        <input
          id={inputId}
          type={isPassword && revealed ? 'text' : type}
          className={['xc-field__input', isPassword && 'xc-field__input--with-action'].filter(Boolean).join(' ')}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            className="xc-field__action"
            aria-label={t(revealed ? 'common.hide' : 'common.show', { label })}
            aria-pressed={revealed}
            onClick={() => setRevealed((value) => !value)}
          >
            {revealed ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
          </button>
        )}
      </div>
      {showHelp && <p id={`${inputId}-help`} className="xc-field__help">{help}</p>}
      {error && (
        <p id={`${inputId}-error`} className="xc-field__error">
          <AlertCircle size={14} aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

const alertIcons = { info: Info, success: CheckCircle2, warning: TriangleAlert, danger: AlertCircle };

export function Alert({ tone = 'info', children, role }: { tone?: keyof typeof alertIcons; children: ReactNode; role?: 'status' | 'alert' }) {
  const Icon = alertIcons[tone];
  return (
    <div className={`xc-alert xc-alert--${tone}`} role={role ?? (tone === 'danger' ? 'alert' : 'status')}>
      <Icon size={18} aria-hidden />
      <div>{children}</div>
    </div>
  );
}

/** Brand mark. `to` navigates in the app; `href` + `label` render a plain link (e.g. the Viewer in a new tab). */
export function Logo({ to = '/', href, label, newTab }: { to?: string; href?: string; label?: string; newTab?: boolean }) {
  const t = useT();
  label ??= t('common.homeLogo');
  const content = (
    <>
      <svg className="xc-logo__mark" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 3.2 19.6 7.6v8.8L12 20.8 4.4 16.4V7.6L12 3.2Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M4.4 7.6 12 12l7.6-4.4M12 12v8.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
      <span className="xc-logo__text" aria-hidden>XCube</span>
    </>
  );
  if (href)
    return <a href={href} className="xc-logo" aria-label={label} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{content}</a>;
  return <Link to={to} className="xc-logo" aria-label={label}>{content}</Link>;
}

/** Full-screen message. `heading` makes the title the page's h1 (a page of its own, e.g. the 404). */
export function StatusScreen({ title, text, busy, role = 'status', action, heading }: { title: string; text?: string; busy?: boolean; role?: 'status' | 'alert'; action?: ReactNode; heading?: boolean }) {
  const Title = heading ? 'h1' : 'p';
  return (
    <main className="xc xc-status">
      <div className="xc-status__box" role={heading ? undefined : role}>
        {busy && <div className="xc-spinner" aria-hidden />}
        <Title className="xc-status__title">{title}</Title>
        {text && <p className="xc-status__text">{text}</p>}
        {action}
      </div>
    </main>
  );
}

/**
 * Suspense fallback while a page's code downloads. It stays blank for a moment so a fast load
 * does not flash a spinner, then shows a quiet status. `inline` fills the app shell's main area
 * (the top bar stays); otherwise it covers the screen like StatusScreen.
 */
export function RouteFallback({ inline, delay = 300 }: { inline?: boolean; delay?: number }) {
  const [shown, setShown] = useState(delay <= 0);
  const t = useT();
  useEffect(() => {
    if (delay <= 0) return;
    const timer = window.setTimeout(() => setShown(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);
  if (inline) {
    return (
      <div className="xc-route-wait" role="status" aria-live="polite">
        {shown && <><div className="xc-spinner" aria-hidden /><span className="sr-only">{t('route.loadingInline')}</span></>}
      </div>
    );
  }
  if (!shown) return <div className="xc xc-status" aria-busy="true" />;
  return <StatusScreen busy title={t('route.loading')} />;
}
