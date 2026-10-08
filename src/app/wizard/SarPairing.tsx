// "수체 분석용 S1+S2" (UR-41) pieces of the S4 GEE step: the Sentinel-1 option group under the S2 bands,
// the pair table in the estimate, and the fixed variables shown in the settings step.
import { Lock } from 'lucide-react';
import { Alert, TextField } from '../../components/ui';
import { Badge } from '../../components/ui/kit';
import { GeeEstimate } from '../../api/generationApi';
import { NO_MATCH_TEXT } from './areaModel';
import { CAUTION_DAYS, coverageText, dateOnly, daysText, MAX_DAYS, ORBIT_OPTIONS, orbitLabel, pairSummary, sarError, SarState } from './sarModel';

export function SarOptions({ sar, onChange, showErrors }: { sar: SarState; onChange: (next: SarState) => void; showErrors: boolean }) {
  const set = (patch: Partial<SarState>) => onChange({ ...sar, ...patch });
  const error = sarError(sar);
  return (
    <div className="sar-box">
      <label className="xc-check area-check">
        <input type="checkbox" checked={sar.enabled} onChange={(event) => set({ enabled: event.target.checked })} />
        <span><strong>AI 수체 분석용으로 Sentinel-1 VV·VH 함께 받기</strong> <span className="xc-hint">같은 위치, 가까운 날짜의 레이더 영상을 광학 영상마다 하나씩 짝지어 받습니다. 레이더는 같은 날 찍은 영상이 드물어 날짜는 근처면 됩니다.</span></span>
      </label>
      {sar.enabled && (
        <details className="area-details sar-details">
          <summary>짝 맞춤 설정 · 날짜 차이 최대 {sar.maxDaysApart || '—'}일 · 궤도 {ORBIT_OPTIONS.find((item) => item.id === sar.orbitPass)?.label} · 짝 없는 날짜 {sar.keepUnpaired ? '남기기' : '빼기'}</summary>
          <div className="form-grid">
            <TextField
              label={`날짜 차이 최대 (일, ${MAX_DAYS.min}~${MAX_DAYS.max})`}
              type="number" min={MAX_DAYS.min} max={MAX_DAYS.max} step={1}
              value={sar.maxDaysApart}
              onChange={(event) => set({ maxDaysApart: event.target.value })}
              help="영역을 덮는 레이더 촬영 중 광학 날짜와 가장 가까운 것을 고릅니다."
              error={error && (showErrors || sar.maxDaysApart !== '') ? error : undefined}
            />
            <label className="xc-field">
              <span className="xc-label">궤도 방향</span>
              <select className="xc-select" aria-label="궤도 방향" value={sar.orbitPass} onChange={(event) => set({ orbitPass: event.target.value as SarState['orbitPass'] })}>
                {ORBIT_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <span className="xc-hint">한 방향만 쓰면 시점마다 레이더 각도가 같아집니다.</span>
            </label>
          </div>
          <div className="xc-field">
            <span className="xc-label" id="sar-unpaired-label">짝이 없는 날짜</span>
            <div className="segmented" role="group" aria-labelledby="sar-unpaired-label">
              <button type="button" aria-pressed={!sar.keepUnpaired} onClick={() => set({ keepUnpaired: false })}>빼기</button>
              <button type="button" aria-pressed={sar.keepUnpaired} onClick={() => set({ keepUnpaired: true })}>레이더 없이 남기기</button>
            </div>
            <span className="xc-hint">{sar.keepUnpaired ? '레이더 값이 비어 있는 시점은 AI 분석에서 결과가 나오지 않습니다.' : 'AI 분석에 쓸 수 있는 시점만 남깁니다.'}</span>
          </div>
          <label className="xc-check area-check">
            <input type="checkbox" checked={sar.waterReference} onChange={(event) => set({ waterReference: event.target.checked })} />
            <span>참조 수체(JRC) 함께 저장 — 비교용, 정답 아님 <span className="xc-hint">장기간 물로 관측된 빈도 50% 이상을 물로 표시한 지도입니다. AI 결과와 견줘 볼 때 씁니다.</span></span>
          </label>
        </details>
      )}
    </div>
  );
}

/** Estimate pairs: one row per S2 date. Degrades to a short note when the server sends no `pairs`. */
export function PairTable({ data, keepUnpaired }: { data: GeeEstimate; keepUnpaired: boolean }) {
  const { pairs, paired, unpaired, noMatch } = pairSummary(data);
  const blocked = noMatch && <Alert tone="danger" role="alert">{NO_MATCH_TEXT}</Alert>;
  if (!pairs) return <>{blocked || <p className="xc-hint">레이더 짝은 생성할 때 정합니다. 서버가 짝 목록을 보내지 않아 미리 보여 드릴 수 없습니다.</p>}</>;
  if (!pairs.length) return <>{blocked || <p className="xc-hint">짝을 맞출 광학 날짜가 없습니다.</p>}</>;
  return (
    <div className="sar-pairs">
      <p className="sar-pairs__summary tabular">
        레이더 짝 <strong>{paired}</strong> / {pairs.length}개 날짜
        {unpaired > 0 && <span className="xc-hint"> · 짝 없음 {unpaired}개 {keepUnpaired ? '(레이더 없이 남김)' : '(제외)'}</span>}
      </p>
      <div className="xc-table-wrap sar-pairs__wrap">
        <table className="xc-table sar-pairs__table" aria-label="광학·레이더 날짜 짝">
          <thead><tr><th scope="col">광학 날짜</th><th scope="col">레이더 날짜</th><th scope="col">차이(일)</th><th scope="col">궤도</th><th scope="col">영역 덮음 %</th></tr></thead>
          <tbody>
            {pairs.map((pair) => {
              if (!pair.s1Date) {
                return (
                  <tr key={pair.s2Date} className="is-unpaired">
                    <td className="tabular">{dateOnly(pair.s2Date)}</td>
                    <td colSpan={4}>{keepUnpaired ? '레이더 없음 – 레이더 없이 남김' : '레이더 없음 – 제외'}</td>
                  </tr>
                );
              }
              const far = pair.daysApart != null && Math.abs(pair.daysApart) > CAUTION_DAYS;
              return (
                <tr key={pair.s2Date}>
                  <td className="tabular">{dateOnly(pair.s2Date)}</td>
                  <td className="tabular">{dateOnly(pair.s1Date)}</td>
                  <td className="tabular">{daysText(pair.daysApart)}{far && <> <Badge tone="warning">주의 · {CAUTION_DAYS}일 넘음</Badge></>}</td>
                  <td>{orbitLabel(pair.orbitPass)}</td>
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
  const rows = [
    { name: 'vv', kind: '레이더', text: 'Sentinel-1 VV · dB · 회색조' },
    { name: 'vh', kind: '레이더', text: 'Sentinel-1 VH · dB · 회색조' },
    ...(waterReference ? [{ name: 'water_gt', kind: '참조', text: 'JRC 장기 수체 · 범주형 (1 물, 0 아님) · 비교용, 정답 아님' }] : []),
  ];
  return (
    <section className="sar-fixed" aria-label="함께 저장되는 변수">
      <h3 className="area-section__title">함께 저장되는 변수</h3>
      <ul className="sar-fixed__list">
        {rows.map((row) => (
          <li key={row.name} className="sar-fixed__item">
            <strong className="tabular">{row.name}</strong>
            <Badge>{row.kind}</Badge>
            <span className="xc-hint">{row.text}</span>
            <span className="sar-fixed__lock xc-hint"><Lock size={12} aria-hidden />이름 고정</span>
          </li>
        ))}
      </ul>
      <p className="xc-hint">AI 수체 추출이 이 이름으로 변수를 찾으므로 바꿀 수 없습니다. 광학 band는 blue·green·red·nir·swir 이름이 기본입니다.</p>
    </section>
  );
}
