// UXF1 (FIX4 §4.4): leaving 데이터 추가 or 수식 융합 inside the app (menu, links, account menu) asks first, like the
// browser already does for closing the tab (beforeunload). The app uses <BrowserRouter>, which has no navigation
// blocker, so a capture-phase click listener catches same-origin links before React Router does; actions that
// navigate from code (sign out, 시작 안내 다시 보기) go through `useConfirmLeave`. Back/forward stay unguarded.
import { createContext, ReactNode, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../components/ui/kit';
import { useLanguage } from '../i18n';

type Guard = { set: (id: string, on: boolean) => void; confirm: (go: () => void) => void };
const GuardContext = createContext<Guard | null>(null);

export function LeaveGuardProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const active = useRef(new Set<string>());
  const [pending, setPending] = useState<null | (() => void)>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!active.current.size || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; // a new tab or window keeps this page
      const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return; // leaving the app: the browser's own warning applies
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setPending(() => () => navigate(`${url.pathname}${url.search}${url.hash}`));
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [navigate]);

  const value = useMemo<Guard>(() => ({
    set: (id, on) => { if (on) active.current.add(id); else active.current.delete(id); },
    confirm: (go) => { if (active.current.size) setPending(() => go); else go(); },
  }), []);

  return (
    <GuardContext.Provider value={value}>
      {children}
      {pending && (
        <ConfirmDialog
          title={t('shell.leave.title')}
          description={t('shell.leave.text')}
          confirmLabel={t('shell.leave.confirm')}
          cancelLabel={t('shell.leave.stay')}
          onConfirm={() => { const go = pending; active.current.clear(); setPending(null); go(); }}
          onClose={() => setPending(null)}
        />
      )}
    </GuardContext.Provider>
  );
}

/** While `on`, links and guarded actions that leave this screen ask first. */
export function useLeaveGuard(on: boolean) {
  const guard = useContext(GuardContext);
  const id = useId();
  useEffect(() => {
    if (!guard) return undefined;
    guard.set(id, on);
    return () => guard.set(id, false);
  }, [guard, id, on]);
}

/** Runs `go` now, or after the user agrees to leave when a screen has unsaved input. */
export function useConfirmLeave() {
  const guard = useContext(GuardContext);
  return useCallback((go: () => void) => (guard ? guard.confirm(go) : go()), [guard]);
}
