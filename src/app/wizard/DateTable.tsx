// S4 GEE "날짜 고르기" (UR-43): one row per date of the estimate, checked by default.
// With S1 pairing on, the radar columns join the same table (it replaces the pair-only table).
import { useState } from 'react';
import { GeeEstimate } from '../../api/generationApi';
import { Alert, Button } from '../../components/ui';
import { Badge } from '../../components/ui/kit';
import { cloudText, DEFAULT_CLEAR_COUNT, estimateDates, leastCloudy } from './dateModel';
import { CAUTION_DAYS, coverageText, dateOnly, daysText, orbitLabel } from './sarModel';

type Props = { data: GeeEstimate; picked: string[]; onChange: (next: string[]) => void; pairing?: { keepUnpaired: boolean } };

export default function DateTable({ data, picked, onChange, pairing }: Props) {
  const dates = estimateDates(data) ?? [];
  const [clearCount, setClearCount] = useState(String(Math.min(DEFAULT_CLEAR_COUNT, dates.length)));
  if (!dates.length) return null;
  const chosen = new Set(picked);
  const all = dates.map((item) => item.date);
  const count = all.filter((date) => chosen.has(date)).length;
  const n = Number(clearCount);
  const nOk = clearCount.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= dates.length;
  const toggle = (date: string, on: boolean) => onChange(all.filter((item) => (item === date ? on : chosen.has(item))));
  const unpaired = pairing ? dates.filter((item) => item.s1 === null) : [];
  const unpairedPicked = unpaired.filter((item) => chosen.has(item.date)).length;

  return (
    <section className="date-pick" aria-label="날짜 고르기">
      <div className="date-pick__head">
        <h3 className="area-estimate__title">날짜 고르기</h3>
        <p className="date-pick__count tabular" aria-live="polite">선택 <strong>{count}</strong> / 전체 {dates.length}개 날짜</p>
      </div>
      <div className="date-pick__actions" role="group" aria-label="빠른 선택">
        <span className="date-pick__clear">
          <label htmlFor="date-pick-clear">구름 적은 순</label>
          <input
            id="date-pick-clear" className="xc-field__input date-pick__n tabular" type="number" min={1} max={dates.length} step={1}
            value={clearCount} onChange={(event) => setClearCount(event.target.value)} aria-invalid={!nOk || undefined}
          />
          <span aria-hidden>개</span>
          <Button size="sm" variant="secondary" disabled={!nOk} onClick={() => onChange(leastCloudy(dates, n))} aria-label={`구름 적은 순 ${nOk ? n : ''}개 고르기`}>적용</Button>
        </span>
        <Button size="sm" variant="ghost" onClick={() => onChange(all)} disabled={count === dates.length}>전체</Button>
        <Button size="sm" variant="ghost" onClick={() => onChange([])} disabled={count === 0}>모두 해제</Button>
      </div>
      {pairing && (
        <p className="xc-hint tabular">
          레이더 짝 {dates.length - unpaired.length} / {dates.length}개 날짜
          {unpaired.length > 0 && ` · 짝 없음 ${unpaired.length}개 ${pairing.keepUnpaired ? '(레이더 없이 남김)' : '(제외)'}`}
        </p>
      )}
      <div className="xc-table-wrap date-pick__wrap">
        <table className="xc-table date-pick__table" aria-label={pairing ? '날짜 고르기 · 광학·레이더 날짜 짝' : '날짜 고르기'}>
          <thead>
            <tr>
              <th scope="col" className="date-pick__check"><span className="sr-only">선택</span></th>
              <th scope="col">날짜</th>
              <th scope="col">장면</th>
              <th scope="col">구름 %</th>
              <th scope="col">영역 덮음 %</th>
              {pairing && <><th scope="col">레이더 날짜</th><th scope="col">차이(일)</th></>}
            </tr>
          </thead>
          <tbody>
            {dates.map((item) => {
              const on = chosen.has(item.date);
              const noPass = !!pairing && item.s1 === null;
              const far = !!item.s1 && Math.abs(item.s1.daysApart) > CAUTION_DAYS;
              return (
                <tr key={item.date} className={noPass ? 'is-unpaired' : undefined}>
                  <td className="date-pick__check">
                    <input type="checkbox" checked={on} onChange={(event) => toggle(item.date, event.target.checked)} aria-label={`${item.date} 선택`} />
                  </td>
                  <td className="tabular">{item.date}</td>
                  <td className="tabular">{item.sceneCount}</td>
                  <td className="tabular">{cloudText(item.cloudPercent)}</td>
                  <td className="tabular">{coverageText(item.coverage)}</td>
                  {pairing && (noPass ? (
                    <td colSpan={2}>{pairing.keepUnpaired ? '레이더 없음 – 레이더 없이 남김' : '레이더 없음 – 제외'}</td>
                  ) : (
                    <>
                      <td className="tabular">{item.s1 ? `${dateOnly(item.s1.date)} ${orbitLabel(item.s1.orbitPass)}` : '—'}</td>
                      <td className="tabular">{daysText(item.s1?.daysApart)}{far && <> <Badge tone="warning">주의 · {CAUTION_DAYS}일 넘음</Badge></>}</td>
                    </>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {count === 0 && <Alert tone="warning" role="alert">날짜를 하나 이상 고르세요. 고른 날짜만 만듭니다.</Alert>}
      {unpairedPicked > 0 && (
        <p className="xc-hint" role="status">
          레이더 짝이 없는 날짜 {unpairedPicked}개를 골랐습니다. {pairing?.keepUnpaired ? '이 날짜는 레이더 없이 생성됩니다.' : '이 날짜는 생성할 때 빠집니다.'} (짝 맞춤 설정 “짝이 없는 날짜”를 따릅니다)
        </p>
      )}
    </section>
  );
}
