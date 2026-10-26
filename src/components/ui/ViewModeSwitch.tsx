import { LayoutGrid, List } from 'lucide-react';
import { useT } from '../../i18n';
import type { ViewMode } from '../../hooks/useViewMode';
import { Segmented } from './kit';

/**
 * `그림 보기 / 목록 보기` (RD1, UX3): the one switch between picture cards and rows, used by the data list and a
 * project's data. Pair it with `useViewMode(key)` so each place remembers its own choice.
 */
export function ViewModeSwitch({ value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void }) {
  const t = useT();
  return (
    <Segmented label={t('datasetFacts.view.label')} value={value} onChange={onChange} items={[
      { id: 'grid', label: <><LayoutGrid size={14} aria-hidden />{t('datasetFacts.view.grid')}</> },
      { id: 'list', label: <><List size={14} aria-hidden />{t('datasetFacts.view.list')}</> },
    ]} />
  );
}
