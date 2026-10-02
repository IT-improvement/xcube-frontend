// Shared building blocks for the app pages (M4): badges, tabs, dialogs, empty
// and loading states, and a small toast. Styles live in ui.css under .xc.
import { X } from 'lucide-react';
import { KeyboardEvent, ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import './kit.css';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'water';

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`xc-badge xc-badge--${tone}`}>{children}</span>;
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="xc-page-head">
      <div className="xc-page-head__text">
        {back}
        <h1 className="xc-page-head__title">{title}</h1>
        {description && <p className="xc-page-head__desc">{description}</p>}
      </div>
      {actions && <div className="xc-page-head__actions">{actions}</div>}
    </header>
  );
}

export type TabItem<T extends string> = { id: T; label: ReactNode; count?: number };

/** Accessible tablist; ←/→ move between tabs. Panels are rendered by the caller. */
export function Tabs<T extends string>({ items, value, onChange, label }: { items: TabItem<T>[]; value: T; onChange: (id: T) => void; label: string }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    onChange(items[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div className="xc-tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={(node) => { refs.current[index] = node; }}
          type="button"
          role="tab"
          aria-selected={item.id === value}
          tabIndex={item.id === value ? 0 : -1}
          className="xc-tabs__tab"
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {item.label}
          {item.count != null && <span className="xc-tabs__count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Modal dialog: Esc closes, focus moves inside and returns on close. */
export function Dialog({ title, description, children, footer, onClose, size = 'md', role = 'dialog' }: { title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; onClose: () => void; size?: 'sm' | 'md' | 'lg'; role?: 'dialog' | 'alertdialog' }) {
  const id = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = boxRef.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-dialog-close])');
    (first ?? boxRef.current)?.focus();
    return () => previous?.focus?.();
  }, []);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
    if (event.key !== 'Tab' || !boxRef.current) return;
    const items = Array.from(boxRef.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)'));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return (
    <div className="xc-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        ref={boxRef}
        className={`xc-dialog xc-dialog--${size}`}
        role={role}
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-desc` : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="xc-dialog__head">
          <h2 id={`${id}-title`} className="xc-dialog__title">{title}</h2>
          <button type="button" className="xc-icon-btn" data-dialog-close aria-label="닫기" onClick={onClose}><X size={18} aria-hidden /></button>
        </div>
        {description && <p id={`${id}-desc`} className="xc-dialog__desc">{description}</p>}
        {children && <div className="xc-dialog__body">{children}</div>}
        {footer && <div className="xc-dialog__foot">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="xc-empty">
      {icon && <span className="xc-empty__icon" aria-hidden>{icon}</span>}
      <p className="xc-empty__title">{title}</p>
      {text && <p className="xc-empty__text">{text}</p>}
      {action && <div className="xc-empty__action">{action}</div>}
    </div>
  );
}

export function Skeleton({ lines = 3, label = '불러오는 중' }: { lines?: number; label?: string }) {
  return (
    <div className="xc-skeleton" role="status" aria-label={label}>
      {Array.from({ length: lines }, (_, index) => <span key={index} style={{ width: `${92 - index * 14}%` }} />)}
    </div>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={['xc-card', className].filter(Boolean).join(' ')}>
      {(title || actions) && (
        <div className="xc-card__head">
          {title && <h2 className="xc-card__title">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Short-lived status message, announced politely. */
export function useToast() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 3200);
    return () => window.clearTimeout(timer);
  }, [message]);
  const show = useCallback((text: string) => setMessage(text), []);
  const node = message ? <div className="xc-toast" role="status">{message}</div> : null;
  return { show, node };
}
