// S4 GEE "날짜 고르기" (UR-43, UR-47): one row per date that covers the area, ranked from the least cloud.
// The user writes how many dates to make; the least cloudy ones are checked at once. Checkboxes still adjust.
// With S1 pairing on, the radar columns join the same table.
import { useEffect, useState } from 'react';
import { GeeEstimate } from '../../api/generationApi';
import { Alert, Button } from '../../components/ui';
import { Badge } from '../../components/ui/kit';
import { byLeastCloud, cloudText, estimateDates, leastCloudy } from './dateModel';
import { CAUTION_DAYS, coverageText, dateOnly, daysText, orbitLabel } from './sarModel';

type Props = { data: GeeEstimate; picked: string[]; onChange: (next: string[]) => void; pairing?: { keepUnpaired: boolean } };
type Order = 'clear' | 'date';

export default function DateTable({ data, picked, onChange, pairing }: Props) {
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
    <section className="date-pick" aria-label="날짜 고르기">
      <div className="date-pick__head">
        <h3 className="area-estimate__title">날짜 고르기</h3>
        <p className="date-pick__count tabular" aria-live="polite">선택 <strong>{count}</strong> / 전체 {dates.length}개 날짜</p>
      </div>
      <div className="date-pick__actions" role="group" aria-label="날짜 고르기 도구">
        <span className="date-pick__clear">
          <label htmlFor="date-pick-count">만들 날짜 수</label>
          <input
            id="date-pick-count" className="xc-field__input date-pick__n tabular" type="number" min={1} max={dates.length} step={1}
            value={wanted} onChange={(event) => setCount(event.target.value)} aria-invalid={!nOk || undefined}
            aria-describedby="date-pick-count-hint"
          />
          <span aria-hidden>개 / {dates.length}개</span>
        </span>
        <Button size="sm" variant="ghost" onClick={() => onChange(all)} disabled={count === dates.length}>전체</Button>
        <Button size="sm" variant="ghost" onClick={() => onChange([])} disabled={count === 0}>모두 해제</Button>
        <span className="date-pick__order" role="group" aria-label="표 정렬">
          <Button size="sm" variant={order === 'clear' ? 'secondary' : 'ghost'} aria-pressed={order === 'clear'} onClick={() => setOrder('clear')}>구름 적은 순</Button>
          <Button size="sm" variant={order === 'date' ? 'secondary' : 'ghost'} aria-pressed={order === 'date'} onClick={() => setOrder('date')}>날짜순</Button>
        </span>
      </div>
      <p className="xc-hint" id="date-pick-count-hint">
        {hasNoise ? '영역 안 구름·그림자가 적은 순' : '구름이 적은 순'}으로 {nOk ? n : '원하는 수'}개를 고릅니다. 체크로 직접 바꿀 수도 있습니다.
      </p>
      <p className="xc-hint tabular">
        위치를 100% 덮는 날짜만 보여 줍니다.
        {excluded.length > 0 && ` 다 덮지 못해 뺀 날짜 ${excluded.length}개: ${excluded.map((item) => `${item.date}(${coverageText(item.coverage)}%)`).join(', ')}`}
      </p>
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
              <th scope="col">구름 순위</th>
              <th scope="col">날짜</th>
              {hasNoise && <th scope="col">영역 구름·그림자 %</th>}
              <th scope="col">{hasNoise ? '타일 구름 %' : '구름 %'}</th>
              <th scope="col">장면</th>
              {pairing && <><th scope="col">레이더 날짜</th><th scope="col">차이(일)</th></>}
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
                    <input type="checkbox" checked={on} onChange={(event) => toggle(item.date, event.target.checked)} aria-label={`${item.date} 선택`} />
                  </td>
                  <td className="tabular">{rank.get(item.date)}</td>
                  <td className="tabular">{item.date}</td>
                  {hasNoise && <td className="tabular">{cloudText(item.noisePercent)}</td>}
                  <td className="tabular">{cloudText(item.cloudPercent)}</td>
                  <td className="tabular">{item.sceneCount}</td>
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
