// "수체 분석용 S1+S2" (UR-41) pieces of the S4 GEE step: the Sentinel-1 option group under the S2 bands,
// the pair table in the estimate, and the fixed variables shown in the settings step.
import { Lock } from 'lucide-react';
import { Alert, TextField } from '../../components/ui';
import { Badge } from '../../components/ui/kit';
import { GeeEstimate } from '../../api/generationApi';
import { useLanguage } from '../../i18n';
import '../../i18n/wizard';
import { blockerText } from './areaModel';
import { CAUTION_DAYS, coverageText, dateOnly, daysText, MAX_DAYS, ORBIT_PASSES, orbitLabel, orbitOption, pairSummary, sarError, SarState } from './sarModel';
import { withStrong } from './strong';

export function SarOptions({ sar, onChange, showErrors }: { sar: SarState; onChange: (next: SarState) => void; showErrors: boolean }) {
  const { lang, t } = useLanguage();
  const set = (patch: Partial<SarState>) => onChange({ ...sar, ...patch });
  const error = sarError(sar, lang);
  return (
    <div className="sar-box">
      <label className="xc-check area-check">
        <input type="checkbox" checked={sar.enabled} onChange={(event) => set({ enabled: event.target.checked })} />
        <span><strong>{t('wizard.sar.enable')}</strong> <span className="xc-hint">{t('wizard.sar.enableHint')}</span></span>
      </label>
      {sar.enabled && (
        <details className="area-details sar-details">
          <summary>{t('wizard.sar.settings', { days: sar.maxDaysApart || '—', orbit: orbitOption(sar.orbitPass, lang), unpaired: t(sar.keepUnpaired ? 'wizard.sar.keepShort' : 'wizard.sar.dropShort') })}</summary>
          <div className="form-grid">
            <TextField
              label={t('wizard.sar.maxDays', { min: MAX_DAYS.min, max: MAX_DAYS.max })}
              type="number" min={MAX_DAYS.min} max={MAX_DAYS.max} step={1}
              value={sar.maxDaysApart}
              onChange={(event) => set({ maxDaysApart: event.target.value })}
              help={t('wizard.sar.maxDaysHelp')}
              error={error && (showErrors || sar.maxDaysApart !== '') ? error : undefined}
            />
            <label className="xc-field">
              <span className="xc-label">{t('wizard.sar.orbit')}</span>
              <select className="xc-select" aria-label={t('wizard.sar.orbit')} value={sar.orbitPass} onChange={(event) => set({ orbitPass: event.target.value as SarState['orbitPass'] })}>
                {ORBIT_PASSES.map((pass) => <option key={pass} value={pass}>{orbitOption(pass, lang)}</option>)}
              </select>
              <span className="xc-hint">{t('wizard.sar.orbitHint')}</span>
            </label>
          </div>
          <div className="xc-field">
            <span className="xc-label" id="sar-unpaired-label">{t('wizard.sar.unpaired')}</span>
            <div className="segmented" role="group" aria-labelledby="sar-unpaired-label">
              <button type="button" aria-pressed={!sar.keepUnpaired} onClick={() => set({ keepUnpaired: false })}>{t('wizard.sar.drop')}</button>
              <button type="button" aria-pressed={sar.keepUnpaired} onClick={() => set({ keepUnpaired: true })}>{t('wizard.sar.keep')}</button>
            </div>
            <span className="xc-hint">{t(sar.keepUnpaired ? 'wizard.sar.keepHint' : 'wizard.sar.dropHint')}</span>
          </div>
          <label className="xc-check area-check">
            <input type="checkbox" checked={sar.waterReference} onChange={(event) => set({ waterReference: event.target.checked })} />
            <span>{t('wizard.sar.waterRef')} <span className="xc-hint">{t('wizard.sar.waterRefHint')}</span></span>
          </label>
        </details>
      )}
    </div>
  );
}

/** Estimate pairs: one row per S2 date. Degrades to a short note when the server sends no `pairs`. */
export function PairTable({ data, keepUnpaired }: { data: GeeEstimate; keepUnpaired: boolean }) {
  const { lang, t } = useLanguage();
  const { pairs, paired, unpaired, noMatch } = pairSummary(data);
  const blocked = noMatch && <Alert tone="danger" role="alert">{blockerText('NO_S1_MATCH', lang)}</Alert>;
  if (!pairs) return <>{blocked || <p className="xc-hint">{t('wizard.sar.noPairList')}</p>}</>;
  if (!pairs.length) return <>{blocked || <p className="xc-hint">{t('wizard.sar.noOptical')}</p>}</>;
  return (
    <div className="sar-pairs">
      <p className="sar-pairs__summary tabular">
        {withStrong(t, 'wizard.sar.pairCount', 'paired', paired, { count: pairs.length })}
        {unpaired > 0 && <span className="xc-hint">{t('wizard.sar.unpairedNote', { count: unpaired, how: t(keepUnpaired ? 'wizard.sar.keptNote' : 'wizard.sar.droppedNote') })}</span>}
      </p>
      <div className="xc-table-wrap sar-pairs__wrap">
        <table className="xc-table sar-pairs__table" aria-label={t('wizard.sar.pairsLabel')}>
          <thead><tr><th scope="col">{t('wizard.sar.opticalDate')}</th><th scope="col">{t('wizard.sar.radarDate')}</th><th scope="col">{t('wizard.sar.daysApart')}</th><th scope="col">{t('wizard.sar.orbitCol')}</th><th scope="col">{t('wizard.sar.coverage')}</th></tr></thead>
          <tbody>
            {pairs.map((pair) => {
              if (!pair.s1Date) {
                return (
                  <tr key={pair.s2Date} className="is-unpaired">
                    <td className="tabular">{dateOnly(pair.s2Date)}</td>
                    <td colSpan={4}>{t(keepUnpaired ? 'wizard.sar.noRadarKept' : 'wizard.sar.noRadarDropped')}</td>
                  </tr>
                );
              }
              const far = pair.daysApart != null && Math.abs(pair.daysApart) > CAUTION_DAYS;
              return (
                <tr key={pair.s2Date}>
                  <td className="tabular">{dateOnly(pair.s2Date)}</td>
                  <td className="tabular">{dateOnly(pair.s1Date)}</td>
                  <td className="tabular">{daysText(pair.daysApart)}{far && <> <Badge tone="warning">{t('wizard.sar.caution', { days: CAUTION_DAYS })}</Badge></>}</td>
                  <td>{orbitLabel(pair.orbitPass, lang)}</td>
                  <td className="tabular">{coverageText(pair.coverage)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {blocked}
    </div>
  );
}

/** Variables the server adds for water analysis; their names are fixed because the AI looks them up by name. */
export function FixedVariables({ waterReference }: { waterReference: boolean }) {
  const { t } = useLanguage();
  const rows = [
    { name: 'vv', kind: t('wizard.sar.kindRadar'), text: t('wizard.sar.vvText') },
    { name: 'vh', kind: t('wizard.sar.kindRadar'), text: t('wizard.sar.vhText') },
    ...(waterReference ? [{ name: 'water_gt', kind: t('wizard.sar.kindReference'), text: t('wizard.sar.waterText') }] : []),
  ];
  return (
    <section className="sar-fixed" aria-label={t('wizard.sar.fixedTitle')}>
      <h3 className="area-section__title">{t('wizard.sar.fixedTitle')}</h3>
      <ul className="sar-fixed__list">
        {rows.map((row) => (
          <li key={row.name} className="sar-fixed__item">
            <strong className="tabular">{row.name}</strong>
            <Badge>{row.kind}</Badge>
            <span className="xc-hint">{row.text}</span>
            <span className="sar-fixed__lock xc-hint"><Lock size={12} aria-hidden />{t('wizard.sar.locked')}</span>
          </li>
        ))}
      </ul>
      <p className="xc-hint">{t('wizard.sar.fixedNote')}</p>
    </section>
  );
}
