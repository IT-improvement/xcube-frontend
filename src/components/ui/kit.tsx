// Shared building blocks for the app pages: tags, tabs, radio groups, dialogs, empty and loading
// states and a small toast. Field-book system (DESIGN.md); styles in kit.css under .xc.
import { X } from 'lucide-react';
import { KeyboardEvent, ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { userMessage } from '../../api/httpClient';
import { useLanguage, useT } from '../../i18n';
import { Alert, Button } from '.';
import './kit.css';

/** `primary` is the ink tag (owner, group); water and result are data hues; the status trio always sits next to words. */
export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'water' | 'result';

/** Tag: 4px corners, words first, the tone only colours them. */
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
const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
const panelId = (prefix: string) => `${prefix}-panel`;

/** Accessible tablist; ←/→ (and Home/End) move between tabs. Render the content in <TabPanel> with the same `idPrefix`. */
export function Tabs<T extends string>({ items, value, onChange, label, idPrefix }: { items: TabItem<T>[]; value: T; onChange: (id: T) => void; label: string; idPrefix: string }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const last = items.length - 1;
    const next = event.key === 'ArrowRight' ? (index + 1) % items.length
      : event.key === 'ArrowLeft' ? (index - 1 + items.length) % items.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? last : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(items[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div className="xc-tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={(node) => { refs.current[index] = node; }}
          id={tabId(idPrefix, item.id)}
          type="button"
          role="tab"
          aria-selected={item.id === value}
          aria-controls={panelId(idPrefix)}
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

/** The one panel a <Tabs> controls; it is labelled by the selected tab. */
export function TabPanel({ idPrefix, value, className, children }: { idPrefix: string; value: string; className?: string; children: ReactNode }) {
  return <div role="tabpanel" id={panelId(idPrefix)} aria-labelledby={tabId(idPrefix, value)} className={className}>{children}</div>;
}

const RADIO_STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Radio group of `role="radio"` buttons (cards, chips, list rows) with the standard keyboard model:
 * one tab stop on the checked item (or the first), arrows move and select, Home/End jump.
 */
export function RadioGroup({ label, labelledBy, className, children }: { label?: string; labelledBy?: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const radios = () => Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
  // Runs after every render so the tab stop follows the checked item.
  useLayoutEffect(() => {
    const items = radios();
    const checked = items.findIndex((item) => item.getAttribute('aria-checked') === 'true');
    const stop = checked >= 0 ? checked : items.findIndex((item) => !item.disabled);
    items.forEach((item, index) => { item.tabIndex = index === stop ? 0 : -1; });
  });
  const onKeyDown = (event: KeyboardEvent) => {
    const step = RADIO_STEP[event.key];
    if (step === undefined && event.key !== 'Home' && event.key !== 'End') return;
    const items = radios().filter((item) => !item.disabled);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0 || !items.length) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + step + items.length) % items.length;
    items[next].focus();
    items[next].click();
  };
  return <div ref={ref} role="radiogroup" aria-label={label} aria-labelledby={labelledBy} className={className} onKeyDown={onKeyDown}>{children}</div>;
}

/** Modal dialog: Esc closes, focus moves inside and returns on close. Enters with a short fade and scale. */
export function Dialog({ title, description, children, footer, onClose, size = 'md', role = 'dialog' }: { title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; onClose: () => void; size?: 'sm' | 'md' | 'lg'; role?: 'dialog' | 'alertdialog' }) {
  const id = useId();
  const t = useT();
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
          <button type="button" className="xc-icon-btn" data-dialog-close aria-label={t('common.close')} onClick={onClose}><X size={18} aria-hidden /></button>
        </div>
        {description && <p id={`${id}-desc`} className="xc-dialog__desc">{description}</p>}
        {children && <div className="xc-dialog__body">{children}</div>}
        {footer && <div className="xc-dialog__foot">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * The one way to confirm an action (alertdialog). `onConfirm` runs the action; the caller closes the
 * dialog when it succeeds, and a failure stays in the dialog as a message. Focus starts on the safe button.
 */
export function ConfirmDialog({ title, description, confirmLabel, busyLabel, cancelLabel, tone = 'danger', onConfirm, onClose }: {
  title: string; description?: ReactNode; confirmLabel: string; busyLabel?: string; cancelLabel?: string; tone?: 'danger' | 'ink';
  onConfirm: () => Promise<unknown> | void; onClose: () => void;
}) {
  const { lang, t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const run = async () => {
    setBusy(true);
    setError('');
    try { await onConfirm(); }
    catch (cause) { if (mounted.current) setError(userMessage(cause, lang)); }
    finally { if (mounted.current) setBusy(false); }
  };
  return (
    <Dialog
      role="alertdialog"
      size="sm"
      title={title}
      description={description}
      onClose={onClose}
      footer={<><Button variant="line" onClick={onClose}>{cancelLabel ?? t('common.cancel')}</Button><Button variant={tone} disabled={busy} onClick={run}>{busy ? busyLabel ?? t('common.busy', { label: confirmLabel }) : confirmLabel}</Button></>}
    >
      {error ? <Alert tone="danger">{error}</Alert> : undefined}
    </Dialog>
  );
}

/** Empty state: a title, a sentence and the next action. No decorative icon tile (the `icon` prop is accepted and ignored). */
export function EmptyState({ title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="xc-empty">
      <p className="xc-empty__title">{title}</p>
      {text && <p className="xc-empty__text">{text}</p>}
      {action && <div className="xc-empty__action">{action}</div>}
    </div>
  );
}

export function Skeleton({ lines = 3, label }: { lines?: number; label?: string }) {
  const t = useT();
  return (
    <div className="xc-skeleton" role="status" aria-label={label ?? t('common.loading')}>
      {Array.from({ length: lines }, (_, index) => <span key={index} style={{ width: `${92 - index * 14}%` }} />)}
    </div>
  );
}

/** A ruled sheet (no shadow). The head uses label type. */
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

const TOAST_MS = 3200;
const TOAST_EXIT_MS = 180;

/** Short-lived status message, announced politely. Rises 8px on enter and sinks back on exit. */
export function useToast() {
  const [toast, setToast] = useState<{ text: string; leaving: boolean; key: number } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(toast.leaving ? null : { ...toast, leaving: true }), toast.leaving ? TOAST_EXIT_MS : TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const show = useCallback((text: string) => setToast({ text, leaving: false, key: Date.now() }), []);
  const node = toast ? <div key={toast.key} className={`xc-toast${toast.leaving ? ' is-leaving' : ''}`} role="status">{toast.text}</div> : null;
  return { show, node };
}
