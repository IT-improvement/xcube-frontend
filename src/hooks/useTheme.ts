import { useEffect, useState } from 'react';
export type Theme = 'light' | 'dark';
const STORAGE_KEY = 'xcube-viewer-theme';
function savedTheme(): Theme | null { try { const value = localStorage.getItem(STORAGE_KEY); return value === 'light' || value === 'dark' ? value : null; } catch { return null; } }
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => savedTheme() ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [explicit, setExplicit] = useState(() => savedTheme() !== null);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { const media = window.matchMedia('(prefers-color-scheme: dark)'); const onChange = (event: MediaQueryListEvent) => { if (!explicit) setTheme(event.matches ? 'dark' : 'light'); }; media.addEventListener?.('change', onChange); return () => media.removeEventListener?.('change', onChange); }, [explicit]);
  const toggle = () => { const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next); setExplicit(true); try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage unavailable */ } };
  return { theme, toggle };
}
