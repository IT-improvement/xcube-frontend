import { AlertCircle, CheckCircle2, Eye, EyeOff, Info, TriangleAlert } from 'lucide-react';
import { AnchorHTMLAttributes, ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, useId, useState } from 'react';
import { Link, LinkProps } from 'react-router-dom';
import './ui.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';
type ButtonStyle = { variant?: Variant; size?: Size; block?: boolean };

function buttonClass({ variant = 'primary', size = 'md', block }: ButtonStyle, extra?: string) {
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
  const describedBy = [help && `${inputId}-help`, error && `${inputId}-error`].filter(Boolean).join(' ') || undefined;
  const [revealed, setRevealed] = useState(false);
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
            aria-label={revealed ? `${label} 숨기기` : `${label} 표시`}
            aria-pressed={revealed}
            onClick={() => setRevealed((value) => !value)}
          >
            {revealed ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
          </button>
        )}
      </div>
      {help && <p id={`${inputId}-help`} className="xc-field__help">{help}</p>}
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
export function Logo({ to = '/', href, label = 'XCube 홈', newTab }: { to?: string; href?: string; label?: string; newTab?: boolean }) {
  const content = (
    <>
      <svg className="xc-logo__mark" viewBox="0 0 28 28" aria-hidden>
        <rect width="28" height="28" rx="7" fill="var(--color-primary)" />
        <path d="M14 6.5 21 10.5v7L14 21.5 7 17.5v-7L14 6.5Z" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M7 10.5 14 14.5l7-4M14 14.5v7" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      <span className="xc-logo__text" aria-hidden>XCube</span>
    </>
  );
  if (href)
    return <a href={href} className="xc-logo" aria-label={label} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{content}</a>;
  return <Link to={to} className="xc-logo" aria-label={label}>{content}</Link>;
}

export function StatusScreen({ title, text, busy, role = 'status', action }: { title: string; text?: string; busy?: boolean; role?: 'status' | 'alert'; action?: ReactNode }) {
  return (
    <main className="xc xc-status">
      <div className="xc-status__box" role={role}>
        {busy && <div className="xc-spinner" aria-hidden />}
        <p className="xc-status__title">{title}</p>
        {text && <p className="xc-status__text">{text}</p>}
        {action}
      </div>
    </main>
  );
}
