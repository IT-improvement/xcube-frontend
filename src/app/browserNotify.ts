// Browser notifications (UR-63 F4). Permission is asked once, the first time the user starts a job (generation,
// band math, AI, comparison); a refusal is final (the browser remembers it and we do not ask again). While the app is
// open, new notifications found by the shell's poller are shown with the system notification.
const ASKED_KEY = 'xcube.notify.asked';
/** The account's "browser notifications" choice, cached so the job wrappers can read it without a request. */
const OFF_KEY = 'xcube.notify.browserOff';

const supported = () => typeof window !== 'undefined' && 'Notification' in window;
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null) => { try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage off */ } };

export type BrowserPermission = 'granted' | 'denied' | 'default' | 'unsupported';
export const browserPermission = (): BrowserPermission => (supported() ? (window.Notification.permission as BrowserPermission) : 'unsupported');

export const setBrowserOff = (off: boolean) => write(OFF_KEY, off ? '1' : null);
const browserOff = () => read(OFF_KEY) === '1';

/** Asks for permission now (a button press in settings). Resolves to the new state. */
export async function requestBrowserPermission(): Promise<BrowserPermission> {
  if (!supported()) return 'unsupported';
  write(ASKED_KEY, '1');
  try { return (await window.Notification.requestPermission()) as BrowserPermission; } catch { return browserPermission(); }
}

/** Called when a job starts: asks only the first time, only while undecided, and not when the user turned it off. */
export function askOnceOnJobStart() {
  if (!supported() || browserOff() || read(ASKED_KEY) || window.Notification.permission !== 'default') return;
  write(ASKED_KEY, '1');
  try { void Promise.resolve(window.Notification.requestPermission()).catch(() => {}); } catch { /* old browsers */ }
}

/** Shows one system notification; a click focuses the tab and runs `onClick`. Silent when not allowed. */
export function showBrowserNotification(title: string, body: string | undefined, onClick?: () => void) {
  if (!supported() || browserOff() || window.Notification.permission !== 'granted') return;
  try {
    const shown = new window.Notification(title, { body: body ?? undefined, tag: `xcube-${title}-${body ?? ''}` });
    shown.onclick = () => { window.focus(); onClick?.(); shown.close(); };
  } catch { /* some browsers only allow it from a service worker */ }
}
