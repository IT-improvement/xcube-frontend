// S4 GEE step "영역": four ways to give the area of interest, a map that always shows the result, and the size estimate.
import { Loader2, Search, Trash2, UploadCloud } from 'lucide-react';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { AdminArea, AdminLevel, AreaChoice, AreaPick, AreaUpload, EstimateBlocker, JobSummary, SavedArea } from '../../api/generationApi';
import { userMessage } from '../../api/httpClient';
import { Alert, Button, TextField } from '../../components/ui';
import { Badge, Dialog, EmptyState, Skeleton, Tabs } from '../../components/ui/kit';
import { generation } from '../api';
import { formatBytes } from '../fusion';
import { useLoad } from '../useLoad';
import AreaMap, { AreaSketch } from './AreaMap';
import { ADMIN_ATTRIBUTION, AREA_TABS, AreaState, AreaTab, bboxText, blockerText, hasPolygonOptions, km2Text, ResolvedArea, SIZE_CHIPS, SIZE_LIMITS } from './areaModel';
import { PairTable } from './SarPairing';
import DateTable from './DateTable';
import { estimateDates, isLong, minutesText, selectionTotals } from './dateModel';
import { withPairingBlockers } from './sarModel';
import { EstimateView } from './useGeeEstimate';

/** Picked dates of the estimate (UR-43) and how to change them. */
export type DatePicking = { picked: string[]; onChange: (next: string[]) => void };
type Props = { area: AreaState; onChange: (next: AreaState) => void; resolved: ResolvedArea; estimate: EstimateView; estimateHint: string; showErrors: boolean; pairing?: PairingView; dates?: DatePicking };

export default function AreaStep({ area, onChange, resolved, estimate, estimateHint, showErrors, pairing, dates }: Props) {
  const set = (patch: Partial<AreaState>) => onChange({ ...area, ...patch });
  const pick = area.tab === 'point' ? 'point' : area.tab === 'box' ? 'box' : null;
  return (
    <div className="area-step">
      <h3 className="area-step__title">영역</h3>
      <Tabs<AreaTab> label="영역 지정 방식" items={AREA_TABS} value={area.tab} onChange={(tab) => set({ tab })} />
      <div className="area-layout">
        <div className="area-controls" role="tabpanel" aria-label={AREA_TABS.find((item) => item.id === area.tab)?.label}>
          {area.tab === 'point' && <PointPanel area={area} set={set} showErrors={showErrors} resolved={resolved} />}
          {area.tab === 'admin' && <AdminPanel area={area} set={set} />}
          {area.tab === 'box' && <BoxPanel area={area} set={set} />}
          {area.tab === 'shape' && <ShapePanel area={area} set={set} />}
          {hasPolygonOptions(area.tab) && (area.tab === 'admin' ? area.admin : area.shape) && <PolygonOptions area={area} set={set} />}
          <label className="xc-check area-check">
            <input type="checkbox" checked={area.fullCoverOnly} onChange={(event) => set({ fullCoverOnly: event.target.checked })} />
            <span>영역을 완전히 덮는 장면만 <span className="xc-hint">장면 경계가 영역을 모두 덮는 것만 씁니다.</span></span>
          </label>
        </div>
        <div className="area-preview">
          <AreaMap
            bbox={resolved.bbox}
            geojson={area.tab === 'admin' || area.tab === 'shape' ? resolved.geojson : undefined}
            pick={pick}
            onPoint={(lon, lat) => set({ tab: 'point', lon: String(lon), lat: String(lat) })}
            onBox={(bbox) => set({ tab: 'box', west: String(bbox[0]), south: String(bbox[1]), east: String(bbox[2]), north: String(bbox[3]) })}
          />
          <p className="area-caption tabular" data-testid="area-preview" aria-live="polite">
            {resolved.bbox
              ? <><strong>{resolved.label}</strong><br />{bboxText(resolved.bbox)}{resolved.areaKm2 != null && ` · ${km2Text(resolved.areaKm2)}`}</>
              : <span className="xc-hint">{pick === 'point' ? '지도를 눌러 중심을 고르세요.' : pick === 'box' ? '지도를 끌어 사각형을 그리세요.' : '영역을 고르면 지도에 표시됩니다.'}</span>}
          </p>
        </div>
      </div>
      {showErrors && resolved.error && <Alert tone="warning" role="alert">{resolved.error}</Alert>}
      <EstimatePanel estimate={estimate} hint={estimateHint} pairing={pairing} picked={dates?.picked} />
      {estimate.data && dates && estimateDates(estimate.data) && <DateTable data={estimate.data} picked={dates.picked} onChange={dates.onChange} pairing={pairing} />}
    </div>
  );
}

function PointPanel({ area, set, showErrors, resolved }: { area: AreaState; set: (patch: Partial<AreaState>) => void; showErrors: boolean; resolved: ResolvedArea }) {
  const customWrong = area.sizeChip === 'custom' && !!area.customSize && !!resolved.error && /km/.test(resolved.error);
  return (
    <div className="area-panel">
      <div className="form-grid">
        <TextField label="중심 경도" type="number" step="any" placeholder="예: 127.502" value={area.lon} onChange={(event) => set({ lon: event.target.value })} />
        <TextField label="중심 위도" type="number" step="any" placeholder="예: 36.454" value={area.lat} onChange={(event) => set({ lat: event.target.value })} />
      </div>
      <p className="xc-hint">지도를 눌러도 중심이 정해집니다.</p>
      <div className="xc-field">
        <span className="xc-label" id="area-size-label">한 변 크기</span>
        <div className="area-chips" role="radiogroup" aria-labelledby="area-size-label">
          {SIZE_CHIPS.map((size) => (
            <button key={size} type="button" role="radio" aria-checked={area.sizeChip === String(size)} className={`area-chip ${area.sizeChip === String(size) ? 'is-on' : ''}`} onClick={() => set({ sizeChip: String(size) as AreaState['sizeChip'] })}>{size} km</button>
          ))}
          <button type="button" role="radio" aria-checked={area.sizeChip === 'custom'} className={`area-chip ${area.sizeChip === 'custom' ? 'is-on' : ''}`} onClick={() => set({ sizeChip: 'custom' })}>직접 입력</button>
        </div>
        <span className="xc-hint">연구 기본값 30 km(중심에서 15 km). 더 넓은 영역도 서버가 자동으로 나눠 받습니다.</span>
      </div>
      {area.sizeChip === 'custom' && (
        <>
          <TextField label={`한 변 크기 (km, ${SIZE_LIMITS.min}~${SIZE_LIMITS.max})`} type="number" step="any" min={SIZE_LIMITS.min} max={SIZE_LIMITS.max} value={area.customSize} onChange={(event) => set({ customSize: event.target.value })} />
          {(customWrong || (showErrors && !area.customSize)) && <Alert tone="danger" role="alert">한 변 크기는 {SIZE_LIMITS.min}~{SIZE_LIMITS.max} km로 입력하세요.</Alert>}
        </>
      )}
    </div>
  );
}

function BoxPanel({ area, set }: { area: AreaState; set: (patch: Partial<AreaState>) => void }) {
  return (
    <div className="area-panel">
      <p className="xc-hint">지도에서 끌어 사각형을 그립니다. 끄는 동안에는 지도를 움직일 수 없습니다.</p>
      <details className="area-details" open={!!(area.west || area.south || area.east || area.north) || undefined}>
        <summary>좌표로 입력 (WGS84 경위도)</summary>
        <div className="form-grid">
          <TextField label="좌하단 경도" type="number" step="any" placeholder="예: 126.50" value={area.west} onChange={(event) => set({ west: event.target.value })} />
          <TextField label="좌하단 위도" type="number" step="any" placeholder="예: 35.00" value={area.south} onChange={(event) => set({ south: event.target.value })} />
          <TextField label="우상단 경도" type="number" step="any" placeholder="예: 129.50" value={area.east} onChange={(event) => set({ east: event.target.value })} />
          <TextField label="우상단 위도" type="number" step="any" placeholder="예: 37.00" value={area.north} onChange={(event) => set({ north: event.target.value })} />
        </div>
      </details>
    </div>
  );
}

const LEVELS: Array<{ id: AdminLevel | ''; label: string }> = [{ id: '', label: '전체' }, { id: 'sido', label: '시도' }, { id: 'sigungu', label: '시군구' }];

function AdminPanel({ area, set }: { area: AreaState; set: (patch: Partial<AreaState>) => void }) {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<AdminLevel | ''>('');
  const [items, setItems] = useState<AdminArea[]>([]);
  const [attribution, setAttribution] = useState(ADMIN_ATTRIBUTION);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadingCode, setLoadingCode] = useState('');

  useEffect(() => {
    const text = query.trim();
    if (!text) { setItems([]); setError(''); setBusy(false); return; }
    let cancelled = false;
    setBusy(true);
    const timer = window.setTimeout(() => {
      generation.searchAdminAreas(text, level || undefined)
        .then((result) => { if (cancelled) return; setItems(result.items); setError(''); if (result.attribution) setAttribution(result.attribution); })
        .catch((cause) => { if (!cancelled) { setItems([]); setError(userMessage(cause)); } })
        .finally(() => { if (!cancelled) setBusy(false); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, level]);

  const choose = async (item: AdminArea) => {
    setLoadingCode(item.code); setError('');
    try { set({ admin: await generation.getAdminArea(item.code) }); }
    catch (cause) { setError(userMessage(cause)); }
    finally { setLoadingCode(''); }
  };
  return (
    <div className="area-panel">
      <TextField label="행정구역 이름 검색" type="search" placeholder="예: 제주시, 청주" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
      <div className="area-chips" role="radiogroup" aria-label="행정구역 단계">
        {LEVELS.map((item) => (
          <button key={item.id || 'all'} type="button" role="radio" aria-checked={level === item.id} className={`area-chip ${level === item.id ? 'is-on' : ''}`} onClick={() => setLevel(item.id)}>{item.label}</button>
        ))}
      </div>
      {error && <Alert tone="danger" role="alert">{error}</Alert>}
      {busy && <p className="xc-hint" role="status"><Loader2 size={14} className="spin" aria-hidden /> 검색하는 중…</p>}
      {!busy && query.trim() && !error && !items.length && <p className="xc-hint" role="status">검색 결과가 없습니다.</p>}
      {!!items.length && (
        <ul className="area-list" aria-label="행정구역 검색 결과">
          {items.map((item) => {
            const on = area.admin?.code === item.code;
            return (
              <li key={item.code}>
                <button type="button" aria-pressed={on} className={`area-item ${on ? 'is-on' : ''}`} disabled={!!loadingCode} onClick={() => choose(item)}>
                  <span className="xc-cell-main"><strong>{item.name}</strong>{item.parentName && !item.name.startsWith(item.parentName) && <small>{item.parentName}</small>}</span>
                  <Badge>{item.level === 'sido' ? '시도' : '시군구'}</Badge>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {area.admin && <p className="xc-hint" role="status">선택: <strong>{[area.admin.parentName, area.admin.name].filter(Boolean).join(' ')}</strong></p>}
      <p className="xc-hint area-attribution">{attribution}</p>
    </div>
  );
}

function PolygonOptions({ area, set }: { area: AreaState; set: (patch: Partial<AreaState>) => void }) {
  return (
    <fieldset className="area-fieldset">
      <legend className="xc-label">영역 처리</legend>
      <div className="area-chips" role="radiogroup" aria-label="영역 처리 방식">
        <button type="button" role="radio" aria-checked={area.clip === 'shape'} className={`area-chip ${area.clip === 'shape' ? 'is-on' : ''}`} onClick={() => set({ clip: 'shape' })}>경계로 자르기</button>
        <button type="button" role="radio" aria-checked={area.clip === 'bbox'} className={`area-chip ${area.clip === 'bbox' ? 'is-on' : ''}`} onClick={() => set({ clip: 'bbox' })}>사각형 그대로</button>
      </div>
      <span className="xc-hint">{area.clip === 'shape' ? '경계 밖은 값 없음(nodata)으로 저장합니다.' : '경계를 감싸는 사각형 전체를 저장합니다.'}</span>
      <label className="xc-check">
        <input type="checkbox" checked={area.clip === 'shape' && area.maskVariable} disabled={area.clip !== 'shape'} onChange={(event) => set({ maskVariable: event.target.checked })} />
        <span>경계선 표시 변수 저장 <span className="xc-hint">안쪽 1, 바깥쪽 0인 변수(aoi_mask)를 함께 만듭니다.</span></span>
      </label>
    </fieldset>
  );
}

type Pending = { name: string; file?: File; jobId?: string | number; choice: AreaChoice };

function ShapePanel({ area, set }: { area: AreaState; set: (patch: Partial<AreaState>) => void }) {
  const areas = useLoad<SavedArea[]>(() => generation.listAreas());
  const [deleting, setDeleting] = useState<SavedArea | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [pickKind, setPickKind] = useState<'dissolve' | 'attribute'>('dissolve');
  const [attribute, setAttribute] = useState('');
  const [attrValue, setAttrValue] = useState('');
  const [fromJobOpen, setFromJobOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const select = async (item: SavedArea) => {
    setError('');
    if (item.geojson) { set({ shape: item }); return; }
    try { set({ shape: await generation.getArea(item.id) }); } catch (cause) { setError(userMessage(cause)); }
  };
  const finish = (result: AreaUpload, source: Omit<Pending, 'choice'>) => {
    if (result.choice) {
      setPending({ ...source, choice: result.choice });
      setPickKind('dissolve');
      const first = result.choice.attributes[0];
      setAttribute(first?.name ?? ''); setAttrValue(first?.values?.[0] != null ? String(first.values[0]) : '');
      return;
    }
    setPending(null); setFile(null); setName(''); setFromJobOpen(false);
    setNotice(`“${result.area.name}” 영역을 저장했습니다.`);
    areas.reload();
    set({ shape: result.area, tab: 'shape' });
    if (!result.area.geojson) void select(result.area);
  };
  const run = async (source: Omit<Pending, 'choice'>, picked: AreaPick = {}) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = source.file ? await generation.uploadArea(source.file, source.name, picked) : await generation.areaFromJob(source.jobId!, source.name, picked);
      finish(result, source);
    } catch (cause) {
      setError(userMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0];
    event.target.value = '';
    if (!next) return;
    setFile(next); setPending(null); setNotice('');
    if (!name) setName(next.name.replace(/\.(zip|geojson|json)$/i, ''));
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await generation.deleteArea(deleting.id);
      if (area.shape && String(area.shape.id) === String(deleting.id)) set({ shape: null });
      setNotice(`“${deleting.name}” 영역을 삭제했습니다.`);
      areas.reload();
    } catch (cause) { setError(userMessage(cause)); }
    setDeleting(null);
  };
  const attrDef = pending?.choice.attributes.find((item) => item.name === attribute);
  const pickReady = pickKind === 'dissolve' || (!!attribute && !!attrValue.trim());

  return (
    <div className="area-panel">
      <div className="area-section">
        <strong className="area-section__title">저장된 영역</strong>
        {areas.loading ? <Skeleton lines={2} label="내 영역을 불러오는 중" /> : areas.error ? <Alert tone="danger" role="alert">{areas.error}</Alert> : !(areas.data ?? []).length ? (
          <EmptyState title="저장된 영역이 없습니다" text="아래에서 Shapefile을 올리면 다음 작업에서도 다시 고를 수 있습니다." />
        ) : (
          <ul className="area-list" aria-label="저장된 영역">
            {(areas.data ?? []).map((item) => {
              const on = area.shape?.id === item.id;
              return (
                <li key={item.id} className="area-saved">
                  <button type="button" aria-pressed={on} className={`area-item ${on ? 'is-on' : ''}`} onClick={() => select(item)}>
                    <AreaSketch bbox={item.bbox} geojson={item.geojson} width={96} height={64} className="area-thumb" label={`${item.name} 미리보기`} />
                    <span className="xc-cell-main"><strong>{item.name}</strong><small className="tabular">{km2Text(item.areaKm2)}</small></span>
                  </button>
                  <button type="button" className="xc-icon-btn" aria-label={`${item.name} 삭제`} onClick={() => setDeleting(item)}><Trash2 size={16} aria-hidden /></button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="area-section">
        <strong className="area-section__title">Shapefile 올리기</strong>
        <div className="form-grid">
          <div className="xc-field">
            <span className="xc-label">Shapefile ZIP</span>
            <div className="area-file">
              <input ref={fileInput} type="file" accept=".zip,.geojson,.json" hidden aria-label="Shapefile ZIP 선택" onChange={chooseFile} />
              <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}><UploadCloud size={16} aria-hidden />{file ? '다른 파일 선택' : '파일 선택'}</Button>
              <span className="xc-hint">{file ? file.name : '.shp .shx .dbf .prj를 담은 ZIP'}</span>
            </div>
          </div>
          <TextField label="영역 이름" value={name} maxLength={100} placeholder="예: 제주 연구 구역" onChange={(event) => setName(event.target.value)} />
        </div>
        <div><Button size="sm" disabled={!file || !name.trim() || busy || !!pending} onClick={() => run({ file: file!, name: name.trim() })}>{busy && !pending ? <><Loader2 size={14} className="spin" aria-hidden />올리는 중…</> : '영역으로 저장'}</Button></div>
      </div>

      {pending && (
        <fieldset className="area-fieldset" aria-label="다각형 선택">
          <legend className="xc-label">다각형이 {pending.choice.polygonCount ? `${pending.choice.polygonCount}개` : '여러 개'} 있습니다</legend>
          <div className="area-chips" role="radiogroup" aria-label="다각형 처리 방식">
            <button type="button" role="radio" aria-checked={pickKind === 'dissolve'} className={`area-chip ${pickKind === 'dissolve' ? 'is-on' : ''}`} onClick={() => setPickKind('dissolve')}>전체 합치기</button>
            <button type="button" role="radio" aria-checked={pickKind === 'attribute'} className={`area-chip ${pickKind === 'attribute' ? 'is-on' : ''}`} onClick={() => setPickKind('attribute')}>속성 값으로 고르기</button>
          </div>
          {pickKind === 'attribute' && (
            <div className="form-grid">
              {pending.choice.attributes.length ? (
                <label className="xc-field">
                  <span className="xc-label">속성</span>
                  <select className="xc-select" value={attribute} onChange={(event) => { setAttribute(event.target.value); const next = pending.choice.attributes.find((item) => item.name === event.target.value); setAttrValue(next?.values?.[0] != null ? String(next.values[0]) : ''); }}>
                    {pending.choice.attributes.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
                  </select>
                </label>
              ) : <TextField label="속성" value={attribute} onChange={(event) => setAttribute(event.target.value)} placeholder="예: sgg_nm_k" />}
              {attrDef?.values?.length ? (
                <label className="xc-field">
                  <span className="xc-label">값</span>
                  <select className="xc-select" value={attrValue} onChange={(event) => setAttrValue(event.target.value)}>
                    {attrDef.values.map((value) => <option key={String(value)} value={String(value)}>{String(value)}</option>)}
                  </select>
                </label>
              ) : <TextField label="값" value={attrValue} onChange={(event) => setAttrValue(event.target.value)} placeholder="예: 제주시" />}
            </div>
          )}
          <div className="area-actions">
            <Button size="sm" disabled={!pickReady || busy} onClick={() => run(pending, pickKind === 'dissolve' ? { dissolve: true } : { attribute, value: attrValue.trim() })}>{busy ? <><Loader2 size={14} className="spin" aria-hidden />저장 중…</> : '이 방식으로 저장'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)} disabled={busy}>취소</Button>
          </div>
        </fieldset>
      )}

      <div className="area-section">
        <Button variant="secondary" size="sm" aria-expanded={fromJobOpen} onClick={() => setFromJobOpen((value) => !value)}>내 Shapefile 데이터에서 가져오기</Button>
        {fromJobOpen && <FromJobs busy={busy} onImport={(job) => run({ jobId: job.id, name: job.name })} />}
      </div>

      {error && <Alert tone="danger" role="alert">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {deleting && (
        <Dialog
          title="영역 삭제"
          role="alertdialog"
          size="sm"
          description={`“${deleting.name}” 영역을 삭제할까요? 이미 만든 데이터에는 영향이 없습니다.`}
          onClose={() => setDeleting(null)}
          footer={<><Button variant="secondary" onClick={() => setDeleting(null)}>취소</Button><Button variant="danger" onClick={confirmDelete}>삭제</Button></>}
        />
      )}
    </div>
  );
}

function FromJobs({ busy, onImport }: { busy: boolean; onImport: (job: JobSummary) => void }) {
  const jobs = useLoad<JobSummary[]>(() => generation.listJobs({ type: 'SHAPEFILE', status: 'SUCCEEDED' }));
  if (jobs.loading) return <Skeleton lines={2} label="Shapefile 데이터를 불러오는 중" />;
  if (jobs.error) return <Alert tone="danger" role="alert">{jobs.error}</Alert>;
  const items = (jobs.data ?? []).filter((job) => job.status === 'SUCCEEDED');
  if (!items.length) return <p className="xc-hint">가져올 수 있는 Shapefile 데이터가 없습니다. 완료된 Shapefile 생성 작업만 보입니다.</p>;
  return (
    <ul className="area-list" aria-label="내 Shapefile 데이터">
      {items.map((job) => (
        <li key={job.id} className="area-saved">
          <span className="xc-cell-main area-saved__text"><strong>{job.name}</strong><small>{job.createdAt ? new Date(job.createdAt).toLocaleDateString('ko-KR') : ''}</small></span>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onImport(job)} aria-label={`${job.name} 가져오기`}>가져오기</Button>
        </li>
      ))}
    </ul>
  );
}

/** Sentinel-1 pairing of the request (UR-41); absent when pairing is off. */
export type PairingView = { keepUnpaired: boolean };
const isNoMatch = (blocker: EstimateBlocker) => (typeof blocker === 'string' ? blocker : blocker.code) === 'NO_S1_MATCH';

export function EstimatePanel({ estimate, hint, compact, pairing, picked }: { estimate: EstimateView; hint?: string; compact?: boolean; pairing?: PairingView; picked?: string[] }) {
  const { data } = estimate;
  const dates = estimateDates(data);
  // With a date list the totals follow the checked dates at once; older servers keep the plain estimate.
  const totals = data && dates ? selectionTotals(data, picked ?? dates.map((item) => item.date)) : null;
  const seconds = totals ? totals.seconds : data?.estimatedSeconds ?? null;
  const blockers = !data ? [] : pairing && dates ? withPairingBlockers(data, true) : data.blockers.filter((blocker) => !pairing || !isNoMatch(blocker));
  return (
    <section className={`area-estimate ${compact ? 'is-compact' : ''}`} aria-label="예상 크기">
      <h3 className="area-estimate__title"><Search size={14} aria-hidden /> 예상 크기</h3>
      {estimate.status === 'idle' && <p className="xc-hint">{hint || '컬렉션·기간·영역을 정하면 계산합니다.'}</p>}
      {estimate.status === 'loading' && <p className="xc-hint" role="status"><Loader2 size={14} className="spin" aria-hidden /> 계산하는 중…</p>}
      {estimate.status === 'error' && <Alert tone="warning">예상 크기를 계산하지 못했습니다. {estimate.error} 생성은 계속할 수 있습니다.</Alert>}
      {data && (
        <>
          <dl className="meta-list area-estimate__list">
            <dt>면적</dt><dd className="tabular">{km2Text(data.areaKm2)}</dd>
            <dt>격자</dt><dd className="tabular">{data.grid.width.toLocaleString('ko-KR')} × {data.grid.height.toLocaleString('ko-KR')} px</dd>
            {totals ? (
              <>
                <dt>시점 수</dt>
                <dd className="tabular" data-testid="estimate-times">
                  {totals.count.toLocaleString('ko-KR')}개{totals.count !== totals.total && <span className="xc-hint"> / 전체 {totals.total.toLocaleString('ko-KR')}개 날짜</span>}
                  {pairing && !pairing.keepUnpaired && totals.unpaired > 0 && <span className="xc-hint"> · 짝 없는 {totals.unpaired}개 빠짐</span>}
                </dd>
                <dt>예상 장면 수</dt><dd className="tabular">{totals.scenes.toLocaleString('ko-KR')}개</dd>
                <dt>예상 용량</dt><dd className="tabular" data-testid="estimate-bytes">{formatBytes(totals.bytes)}</dd>
              </>
            ) : (
              <>
                <dt>예상 장면 수</dt><dd className="tabular">{data.scenes == null ? '알 수 없음' : `${data.scenes.toLocaleString('ko-KR')}개`}</dd>
                <dt>예상 용량</dt><dd className="tabular">{formatBytes(data.estimatedBytes)}</dd>
              </>
            )}
            {seconds != null && <><dt>예상 시간</dt><dd className="tabular" data-testid="estimate-time">{minutesText(seconds)}</dd></>}
          </dl>
          {isLong(seconds) && <p className="xc-hint">{dates ? '날짜를 줄이면 빨라집니다.' : '기간이나 영역을 줄이면 빨라집니다.'}</p>}
          {data.requestTiles > 1 && <p className="xc-hint">서버가 {data.requestTiles}개로 나눠 받습니다.</p>}
          {data.warnings.map((warning) => <Alert key={warning} tone="warning">{warning}</Alert>)}
          {blockers.map((blocker, index) => <Alert key={index} tone="danger" role="alert">{blockerText(blocker)}</Alert>)}
          {pairing && !dates && <PairTable data={data} keepUnpaired={pairing.keepUnpaired} />}
        </>
      )}
    </section>
  );
}
