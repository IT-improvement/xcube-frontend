import { useState } from 'react';

/** How a list of datasets is laid out (RD1): picture cards (default) or rows. */
export type ViewMode = 'grid' | 'list';

/** Storage keys, one per place, so the Viewer picker and the data list remember their own choice. */
export const VIEW_KEYS = { picker: 'xcube.viewer.pickerView', data: 'xcube.data.view' } as const;

const read = (key: string): ViewMode => {
  try { return localStorage.getItem(key) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
};

/** The chosen view, remembered in localStorage (a convenience: without storage it starts as pictures). */
export function useViewMode(key: string): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => read(key));
  const choose = (next: ViewMode) => {
    setMode(next);
    try { localStorage.setItem(key, next); } catch { /* storage unavailable */ }
  };
  return [mode, choose];
}
