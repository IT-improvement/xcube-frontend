// S4 GEE "날짜 고르기" (UR-43, UR-47): one row per date that covers the area, ranked from the least cloud.
// The user writes how many dates to make; the least cloudy ones are checked at once. Checkboxes still adjust.
// With S1 pairing on, the radar columns join the same table.
import { useEffect, useState } from 'react';
import { GeeEstimate } from '../../api/generationApi';
import { Alert, Button } from '../../components/ui';
import { Badge } from '../../components/ui/kit';
import { useLanguage } from '../../i18n';
import '../../i18n/wizard';
import { byLeastCloud, cloudText, estimateDates, leastCloudy } from './dateModel';
import { CAUTION_DAYS, coverageText, dateOnly, daysText, orbitLabel } from './sarModel';
import { withStrong } from './strong';

type Props = { data: GeeEstimate; picked: string[]; onChange: (next: string[]) => void; pairing?: { keepUnpaired: boolean } };
type Order = 'clear' | 'date';

export default function DateTable({ data, picked, onChange, pairing }: Props) {
  const { lang, t } = useLanguage();
  const dates = estimateDates(data) ?? [];
  const excluded = data.excludedDates ?? [];
  const chosen = new Set(picked);
  const all = dates.map((item) => item.date);
  const count = all.filter((date) => chosen.has(date)).length;
  const [order, setOrder] = useState<Order>('clear');
  const [wanted, setWanted] = useState(String(count));
  // Checkbox edits, 전체 and 모두 해제 change the count; the field follows them.
  useEffect(() => setWanted(String(count)), [count]);
  if (!dates.length) return null;

  const n = Number(wanted);
  const nOk = wanted.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= dates.length;
  const setCount = (value: string) => {
    setWanted(value);
    const next = Number(value);
    if (value.trim() !== '' && Number.isInteger(next) && next >= 1 && next <= dates.length) onChange(leastCloudy(dates, next));
  };
  const toggle = (date: string, on: boolean) => onChange(all.filter((item) => (item === date ? on : chosen.has(item))));
  const ranked = byLeastCloud(dates);
  const rank = new Map(ranked.map((item, index) => [item.date, index + 1]));
  const rows = order === 'clear' ? ranked : dates;
  const hasNoise = dates.some((item) => item.noisePercent != null);
  const unpaired = pairing ? dates.filter((item) => item.s1 === null) : [];
  const unpairedPicked = unpaired.filter((item) => chosen.has(item.date)).length;

  return (
    <section className="date-pick" aria-label={t('wizard.dates.title')}>
      <div className="date-pick__head">
        <h3 className="area-estimate__title">{t('wizard.dates.title')}</h3>
        <p className="date-pick__count tabular" aria-live="polite">{withStrong(t, 'wizard.dates.count', 'picked', count, { count: dates.length })}</p>
      </div>
      <div className="date-pick__actions" role="group" aria-label={t('wizard.dates.tools')}>
        <span className="date-pick__clear">
          <label htmlFor="date-pick-count">{t('wizard.dates.wanted')}</label>
          <input
            id="date-pick-count" className="xc-field__input date-pick__n tabular" type="number" min={1} max={dates.length} step={1}
            value={wanted} onChange={(event) => setCount(event.target.value)} aria-invalid={!nOk || undefined}
            aria-describedby="date-pick-count-hint"
          />
          <span aria-hidden>{t('wizard.dates.wantedOf', { count: dates.length })}</span>
        </span>
        <span className="date-pick__sel" role="group" aria-label={t('wizard.dates.selection')}>
          <Button size="sm" variant="line" onClick={() => onChange(all)} disabled={count === dates.length}>{t('wizard.dates.all')}</Button>
          <Button size="sm" variant="line" onClick={() => onChange([])} disabled={count === 0}>{t('wizard.dates.none')}</Button>
        </span>
        <span className="date-pick__order" role="group" aria-label={t('wizard.dates.order')}>
          <button type="button" aria-pressed={order === 'clear'} onClick={() => setOrder('clear')}>{t('wizard.dates.byCloud')}</button>
          <button type="button" aria-pressed={order === 'date'} onClick={() => setOrder('date')}>{t('wizard.dates.byDate')}</button>
        </span>
      </div>
      <p className="xc-hint" id="date-pick-count-hint">
        {nOk ? t(hasNoise ? 'wizard.dates.rankHintNoise' : 'wizard.dates.rankHint', { count: n }) : t(hasNoise ? 'wizard.dates.rankHintNoiseAny' : 'wizard.dates.rankHintAny')}
      </p>
      <div className="xc-hint tabular date-pick__cover">
        <span>{t('wizard.dates.fullCoverOnly')}</span>
        {excluded.length > 0 && (
          <details className="date-pick__excluded">
            <summary>{t('wizard.dates.excluded', { count: excluded.length })}</summary>
            <ul>{excluded.map((item) => <li key={item.date}>{item.date} ({coverageText(item.coverage)}%)</li>)}</ul>
          </details>
        )}
      </div>
      {pairing && (
        <p className="xc-hint tabular">
          {t('wizard.sar.pairCount', { paired: dates.length - unpaired.length, count: dates.length })}
          {unpaired.length > 0 && t('wizard.sar.unpairedNote', { count: unpaired.length, how: t(pairing.keepUnpaired ? 'wizard.sar.keptNote' : 'wizard.sar.droppedNote') })}
        </p>
      )}
      <div className="xc-table-wrap date-pick__wrap">
        <table className="xc-table date-pick__table" aria-label={t(pairing ? 'wizard.dates.tableLabelPaired' : 'wizard.dates.tableLabel')}>
          <thead>
            <tr>
              <th scope="col" className="date-pick__check"><span className="sr-only">{t('wizard.dates.select')}</span></th>
              <th scope="col">{t('wizard.dates.rank')}</th>
              <th scope="col">{t('wizard.dates.date')}</th>
              {hasNoise && <th scope="col">{t('wizard.dates.noise')}</th>}
              <th scope="col">{t(hasNoise ? 'wizard.dates.tileCloud' : 'wizard.dates.cloud')}</th>
              <th scope="col">{t('wizard.dates.scenes')}</th>
              {pairing && <><th scope="col">{t('wizard.sar.radarDate')}</th><th scope="col">{t('wizard.sar.daysApart')}</th></>}
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const on = chosen.has(item.date);
              const noPass = !!pairing && item.s1 === null;
              const far = !!item.s1 && Math.abs(item.s1.daysApart) > CAUTION_DAYS;
              return (
                <tr key={item.date} className={[noPass ? 'is-unpaired' : '', on ? 'is-picked' : ''].join(' ').trim() || undefined}>
                  <td className="date-pick__check">
                    <input type="checkbox" checked={on} onChange={(event) => toggle(item.date, event.target.checked)} aria-label={t('wizard.dates.selectDate', { date: item.date })} />
                  </td>
                  <td className="tabular">{rank.get(item.date)}</td>
                  <td className="tabular">{item.date}</td>
                  {hasNoise && <td className="tabular">{cloudText(item.noisePercent)}</td>}
                  <td className="tabular">{cloudText(item.cloudPercent)}</td>
                  <td className="tabular">{item.sceneCount}</td>
                  {pairing && (noPass ? (
                    <td colSpan={2}>{t(pairing.keepUnpaired ? 'wizard.sar.noRadarKept' : 'wizard.sar.noRadarDropped')}</td>
                  ) : (
                    <>
                      <td className="tabular">{item.s1 ? `${dateOnly(item.s1.date)} ${orbitLabel(item.s1.orbitPass, lang)}` : '—'}</td>
                      <td className="tabular">{daysText(item.s1?.daysApart)}{far && <> <Badge tone="warning">{t('wizard.sar.caution', { days: CAUTION_DAYS })}</Badge></>}</td>
                    </>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {count === 0 && <Alert tone="warning" role="alert">{t('wizard.dates.pickOne')}</Alert>}
      {unpairedPicked > 0 && (
        <p className="xc-hint" role="status">
          {t('wizard.sar.unpairedPicked', { count: unpairedPicked, what: t(pairing?.keepUnpaired ? 'wizard.sar.unpairedPickedKept' : 'wizard.sar.unpairedPickedDropped') })}
        </p>
      )}
    </section>
  );
}
