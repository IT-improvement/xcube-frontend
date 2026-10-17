// "시작하기" checklist for first-time users (UR-63 UX1): ① open the example data in the Viewer ② compare an AI
// result with its source ③ add your own data ④ see it together in a project. What is done and whether the guide is
// closed live in this browser (localStorage, a convenience); the account menu's "시작 안내 다시 보기" brings it back.
import { ArrowRight, Check, ExternalLink } from 'lucide-react';
import { ReactElement, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isExample } from '../api/examples';
import { NEEDS, useRoleGate } from '../auth/roles';
import { useT } from '../i18n';
import type { TKey } from '../i18n';
import { aiViewerHref, isOwned, viewerHref, ZarrDataset } from './api';
import '../i18n/fx';

export type StepId = 'viewer' | 'compare' | 'add' | 'project';
const STEPS: StepId[] = ['viewer', 'compare', 'add', 'project'];
const DONE_KEY = 'xcube.onboarding.done';
const HIDDEN_KEY = 'xcube.onboarding.hidden';
const EVENT = 'xcube:onboarding';

const readDone = (): StepId[] => {
  try { const value = JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]'); return Array.isArray(value) ? value.filter((id): id is StepId => STEPS.includes(id)) : []; } catch { return []; }
};
const readHidden = () => { try { return localStorage.getItem(HIDDEN_KEY) === '1'; } catch { return false; } };
const announce = () => window.dispatchEvent(new CustomEvent(EVENT));

export function markStepDone(id: StepId) {
  const done = readDone();
  if (done.includes(id)) return;
  try { localStorage.setItem(DONE_KEY, JSON.stringify([...done, id])); } catch { /* storage off */ }
  announce();
}
export function hideOnboarding() { try { localStorage.setItem(HIDDEN_KEY, '1'); } catch { /* storage off */ } announce(); }
/** Account menu: show the guide again (finished steps stay finished). */
export function showOnboardingAgain() { try { localStorage.removeItem(HIDDEN_KEY); } catch { /* storage off */ } announce(); }

/** The stored state, kept in step with other tabs and with the account menu. */
export function useOnboardingState() {
  const [state, setState] = useState(() => ({ done: readDone(), hidden: readHidden() }));
  const sync = useCallback(() => setState({ done: readDone(), hidden: readHidden() }), []);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === DONE_KEY || event.key === HIDDEN_KEY || event.key === null) sync(); };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', onStorage); };
  }, [sync]);
  return state;
}

/** Example data to point at: an original and an AI result made from it, when the server has them. */
export function pickExamples(items: ZarrDataset[]) {
  const examples = items.filter(isExample);
  const aiResult = examples.find((item) => item.kind === 'AI_RESULT' && item.sourceDatacubeId);
  const original = (aiResult && examples.find((item) => item.id === aiResult.sourceDatacubeId)) ?? examples.find((item) => item.kind !== 'AI_RESULT' && item.kind !== 'COMPARISON');
  return { original, aiResult };
}

/**
 * The checklist on the dashboard. Shown until closed; "add" counts as done once the user owns data. `items` is the
 * dashboard's dataset list (null while loading).
 */
export function OnboardingChecklist({ items }: { items: ZarrDataset[] | null }) {
  const t = useT();
  const { done, hidden } = useOnboardingState();
  const locked = useRoleGate().reason(NEEDS.createData);
  if (hidden || !items) return null;
  const { original, aiResult } = pickExamples(items);
  const owned = items.some((item) => isOwned(item) && !isExample(item));
  const finished = (id: StepId) => done.includes(id) || (id === 'add' && owned);
  const count = STEPS.filter(finished).length;

  type Row = { id: StepId; title: TKey; text: TKey; action: ReactElement | null };
  const external = (href: string, id: StepId, label: TKey) => (
    <a className="xc-btn xc-btn--line xc-btn--sm" href={href} target="_blank" rel="noopener noreferrer" onClick={() => markStepDone(id)}>
      {t(label)}<ExternalLink size={13} aria-hidden /><span className="sr-only">{t('shell.newTab')}</span>
    </a>
  );
  const internal = (to: string, id: StepId | null, label: TKey) => (
    <Link className="xc-btn xc-btn--line xc-btn--sm" to={to} onClick={id ? () => markStepDone(id) : undefined}>{t(label)}<ArrowRight size={13} aria-hidden /></Link>
  );
  const rows: Row[] = [
    { id: 'viewer', title: 'onboarding.viewer.title', text: original ? 'onboarding.viewer.text' : 'onboarding.viewer.noExample', action: external(original ? viewerHref(original.id) : viewerHref(), 'viewer', 'onboarding.viewer.action') },
    { id: 'compare', title: 'onboarding.compare.title', text: aiResult ? 'onboarding.compare.text' : 'onboarding.compare.noExample', action: aiResult?.sourceDatacubeId ? external(aiViewerHref(aiResult.sourceDatacubeId, aiResult.id), 'compare', 'onboarding.compare.action') : internal('/app/analysis/compare', 'compare', 'onboarding.compare.actionPage') },
    { id: 'add', title: 'onboarding.add.title', text: 'onboarding.add.text', action: locked ? null : internal('/app/data/new', null, 'onboarding.add.action') },
    { id: 'project', title: 'onboarding.project.title', text: 'onboarding.project.text', action: internal('/app/projects', 'project', 'onboarding.project.action') },
  ];

  return (
    <section className="onboard" aria-labelledby="onboard-title">
      <div className="onboard__head">
        <h2 id="onboard-title" className="onboard__title">{t('onboarding.title')}</h2>
        <span className="onboard__count tabular">{t('onboarding.count', { done: count, total: STEPS.length })}</span>
        <span className="onboard__spacer" />
        <button type="button" className="xc-btn xc-btn--quiet xc-btn--sm" onClick={hideOnboarding}>{t('onboarding.close')}</button>
      </div>
      <p className="onboard__lead">{t('onboarding.lead')}</p>
      <ol className="onboard__steps">
        {rows.map((row, index) => {
          const isDone = finished(row.id);
          return (
            <li key={row.id} className={`onboard__step${isDone ? ' is-done' : ''}`}>
              <span className="onboard__num tabular" aria-hidden>{isDone ? <Check size={14} /> : index + 1}</span>
              <span className="onboard__text">
                <strong>{t(row.title)}{isDone && <span className="onboard__done">{t('onboarding.done')}</span>}</strong>
                <span>{row.id === 'add' && locked ? locked : t(row.text, { name: (row.id === 'compare' ? aiResult?.name : original?.name) ?? '' })}</span>
              </span>
              <span className="onboard__action">{row.action}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
