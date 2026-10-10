// S4 GEE step "영역": four ways to give the area of interest, a map that always shows the result, and the size estimate.
import { Loader2, Search, Trash2, UploadCloud } from 'lucide-react';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { AdminArea, AdminLevel, AreaChoice, AreaPick, AreaUpload, EstimateBlocker, JobSummary, SavedArea } from '../../api/generationApi';
import { userMessage } from '../../api/httpClient';
import { Alert, Button, TextField } from '../../components/ui';
import { Badge, Dialog, EmptyState, RadioGroup, Skeleton, TabPanel, Tabs } from '../../components/ui/kit';
import { generation } from '../api';
import { formatBytes } from '../fusion';
import { useLoad } from '../useLoad';
import { formatDate, formatNumber, useLanguage } from '../../i18n';
import '../../i18n/wizard';
import AreaMap, { AreaSketch } from './AreaMap';
import { ADMIN_ATTRIBUTION, areaTabs, AreaState, AreaTab, bboxText, blockerText, estimateWarnings, hasPolygonOptions, km2Text, ResolvedArea, SIZE_CHIPS, SIZE_LIMITS, warningText } from './areaModel';
import { PairTable } from './SarPairing';
import DateTable from './DateTable';
import { estimateDates, isLong, minutesText, selectionTotals } from './dateModel';
import { withPairingBlockers } from './sarModel';
import { EstimateView } from './useGeeEstimate';

/** Picked dates of the estimate (UR-43) and how to change them. */
export type DatePicking = { picked: string[]; onChange: (next: string[]) => void };
type Props = { area: AreaState; onChange: (next: AreaState) => void; resolved: ResolvedArea; estimate: EstimateView; estimateHint: string; showErrors: boolean; pairing?: PairingView; dates?: DatePicking };

export default function AreaStep({ area, onChange, resolved, estimate, estimateHint, showErrors, pairing, dates }: Props) {
  const { lang, t } = useLanguage();
  const set = (patch: Partial<AreaState>) => onChange({ ...area, ...patch });
  const pick = area.tab === 'point' ? 'point' : area.tab === 'box' ? 'box' : null;
  return (
    <div className="area-step">
      <h3 className="area-step__title">{t('wizard.area.title')}</h3>
      <Tabs<AreaTab> label={t('wizard.area.tabsLabel')} idPrefix="area-mode" items={areaTabs(lang)} value={area.tab} onChange={(tab) => set({ tab })} />
      <div className="area-layout">
        <TabPanel idPrefix="area-mode" value={area.tab} className="area-controls">
          {area.tab === 'point' && <PointPanel area={area} set={set} showErrors={showErrors} resolved={resolved} />}
          {area.tab === 'admin' && <AdminPanel area={area} set={set} />}
          {area.tab === 'box' && <BoxPanel area={area} set={set} />}
          {area.tab === 'shape' && <ShapePanel area={area} set={set} />}
          {hasPolygonOptions(area.tab) && (area.tab === 'admin' ? area.admin : area.shape) && <PolygonOptions area={area} set={set} />}
        </TabPanel>
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
              ? <><strong>{resolved.label}</strong><br />{bboxText(resolved.bbox, lang)}{resolved.areaKm2 != null && ` · ${km2Text(resolved.areaKm2, lang)}`}</>
              : <span className="xc-hint">{t(pick === 'point' ? 'wizard.area.pickPoint' : pick === 'box' ? 'wizard.area.pickBox' : 'wizard.area.pickAny')}</span>}
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
  const { t } = useLanguage();
  const customWrong = area.sizeChip === 'custom' && !!area.customSize && !!resolved.error && /km/.test(resolved.error);
  return (
    <div className="area-panel">
      <div className="form-grid">
        <TextField label={t('wizard.area.point.lon')} type="number" step="any" placeholder={t('wizard.area.point.lonPlaceholder')} value={area.lon} onChange={(event) => set({ lon: event.target.value })} />
        <TextField label={t('wizard.area.point.lat')} type="number" step="any" placeholder={t('wizard.area.point.latPlaceholder')} value={area.lat} onChange={(event) => set({ lat: event.target.value })} />
      </div>
      <p className="xc-hint">{t('wizard.area.point.clickHint')}</p>
      <div className="xc-field">
        <span className="xc-label" id="area-size-label">{t('wizard.area.point.size')}</span>
        <RadioGroup className="area-chips" labelledBy="area-size-label">
          {SIZE_CHIPS.map((size) => (
            <button key={size} type="button" role="radio" aria-checked={area.sizeChip === String(size)} className={`area-chip ${area.sizeChip === String(size) ? 'is-on' : ''}`} onClick={() => set({ sizeChip: String(size) as AreaState['sizeChip'] })}>{size} km</button>
          ))}
          <button type="button" role="radio" aria-checked={area.sizeChip === 'custom'} className={`area-chip ${area.sizeChip === 'custom' ? 'is-on' : ''}`} onClick={() => set({ sizeChip: 'custom' })}>{t('wizard.area.point.custom')}</button>
        </RadioGroup>
        <span className="xc-hint">{t('wizard.area.point.sizeHint')}</span>
      </div>
      {area.sizeChip === 'custom' && (
        <>
          <TextField label={t('wizard.area.point.customLabel', SIZE_LIMITS)} type="number" step="any" min={SIZE_LIMITS.min} max={SIZE_LIMITS.max} value={area.customSize} onChange={(event) => set({ customSize: event.target.value })} />
          {(customWrong || (showErrors && !area.customSize)) && <Alert tone="danger" role="alert">{t('wizard.area.errors.size', SIZE_LIMITS)}</Alert>}
        </>
      )}
    </div>
  );
}

function BoxPanel({ area, set }: { area: AreaState; set: (patch: Partial<AreaState>) => void }) {
  const { t } = useLanguage();
  const example = (value: string) => t('wizard.area.box.example', { value });
  return (
    <div className="area-panel">
      <p className="xc-hint">{t('wizard.area.box.hint')}</p>
      <details className="area-details" open={!!(area.west || area.south || area.east || area.north) || undefined}>
        <summary>{t('wizard.area.box.coords')}</summary>
        <div className="form-grid">
          <TextField label={t('wizard.area.box.west')} type="number" step="any" placeholder={example('126.50')} value={area.west} onChange={(event) => set({ west: event.target.value })} />
          <TextField label={t('wizard.area.box.south')} type="number" step="any" placeholder={example('35.00')} value={area.south} onChange={(event) => set({ south: event.target.value })} />
          <TextField label={t('wizard.area.box.east')} type="number" step="any" placeholder={example('129.50')} value={area.east} onChange={(event) => set({ east: event.target.value })} />
          <TextField label={t('wizard.area.box.north')} type="number" step="any" placeholder={example('37.00')} value={area.north} onChange={(event) => set({ north: event.target.value })} />
        </div>
      </details>
    </div>
  );
}

const LEVELS: Array<{ id: AdminLevel | ''; key: 'all' | 'sido' | 'sigungu' }> = [{ id: '', key: 'all' }, { id: 'sido', key: 'sido' }, { id: 'sigungu', key: 'sigungu' }];
/** Hangul in a server sentence: an English screen shows its own wording instead (server texts get codes in stage 5). */
const HANGUL = /[\uac00-\ud7a3]/;

function AdminPanel({ area, set }: { area: AreaState; set: (patch: Partial<AreaState>) => void }) {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<AdminLevel | ''>('');
  const { lang, t } = useLanguage();
  const [items, setItems] = useState<AdminArea[]>([]);
  const [attribution, setAttribution] = useState(ADMIN_ATTRIBUTION);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null);
  const error = failure ? userMessage(failure.cause, lang) : '';
  // Korean keeps the server's attribution as before; English uses its own unless the server's has no Hangul.
  const attributionText = lang === 'ko' ? attribution : attribution !== ADMIN_ATTRIBUTION && !HANGUL.test(attribution) ? attribution : t('wizard.area.admin.attribution');
  const [loadingCode, setLoadingCode] = useState('');

  useEffect(() => {
    const text = query.trim();
    if (!text) { setItems([]); setFailure(null); setBusy(false); return; }
    let cancelled = false;
    setBusy(true);
    const timer = window.setTimeout(() => {
      generation.searchAdminAreas(text, level || undefined)
        .then((result) => { if (cancelled) return; setItems(result.items); setFailure(null); if (result.attribution) setAttribution(result.attribution); })
        .catch((cause) => { if (!cancelled) { setItems([]); setFailure({ cause }); } })
        .finally(() => { if (!cancelled) setBusy(false); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, level]);

  const choose = async (item: AdminArea) => {
    setLoadingCode(item.code); setFailure(null);
    try { set({ admin: await generation.getAdminArea(item.code) }); }
    catch (cause) { setFailure({ cause }); }
    finally { setLoadingCode(''); }
  };
  return (
    <div className="area-panel">
      <TextField label={t('wizard.area.admin.search')} type="search" placeholder={t('wizard.area.admin.placeholder')} value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
      <RadioGroup className="area-chips" label={t('wizard.area.admin.levels')}>
        {LEVELS.map((item) => (
          <button key={item.id || 'all'} type="button" role="radio" aria-checked={level === item.id} className={`area-chip ${level === item.id ? 'is-on' : ''}`} onClick={() => setLevel(item.id)}>{t(`wizard.area.admin.${item.key}`)}</button>
        ))}
      </RadioGroup>
      {error && <Alert tone="danger" role="alert">{error}</Alert>}
      {busy && <p className="xc-hint" role="status"><Loader2 size={14} className="spin" aria-hidden /> {t('wizard.area.admin.searching')}</p>}
      {!busy && query.trim() && !error && !items.length && <p className="xc-hint" role="status">{t('wizard.area.admin.none')}</p>}
      {!!items.length && (
        <ul className="area-list" aria-label={t('wizard.area.admin.results')}>
          {items.map((item) => {
            const on = area.admin?.code === item.code;
            return (
              <li key={item.code}>
                <button type="button" aria-pressed={on} className={`area-item ${on ? 'is-on' : ''}`} disabled={!!loadingCode} onClick={() => choose(item)}>
                  <span className="xc-cell-main"><strong>{item.name}</strong>{item.parentName && !item.name.startsWith(item.parentName) && <small>{item.parentName}</small>}</span>
                  <Badge>{t(item.level === 'sido' ? 'wizard.area.admin.sido' : 'wizard.area.admin.sigungu')}</Badge>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {area.admin && <p className="xc-hint" role="status">{t('wizard.area.admin.selected')} <strong>{[area.admin.parentName, area.admin.name].filter(Boolean).join(' ')}</strong></p>}
      <p className="xc-hint area-attribution">{attributionText}</p>
    </div>
  );
}

function PolygonOptions({ area, set }: { area: AreaState; set: (patch: Partial<AreaState>) => void }) {
  const { t } = useLanguage();
  return (
    <fieldset className="area-fieldset">
      <legend className="xc-label">{t('wizard.area.clip.legend')}</legend>
      <RadioGroup className="area-chips" label={t('wizard.area.clip.label')}>
        <button type="button" role="radio" aria-checked={area.clip === 'shape'} className={`area-chip ${area.clip === 'shape' ? 'is-on' : ''}`} onClick={() => set({ clip: 'shape' })}>{t('wizard.area.clip.shape')}</button>
        <button type="button" role="radio" aria-checked={area.clip === 'bbox'} className={`area-chip ${area.clip === 'bbox' ? 'is-on' : ''}`} onClick={() => set({ clip: 'bbox' })}>{t('wizard.area.clip.bbox')}</button>
      </RadioGroup>
      <span className="xc-hint">{t(area.clip === 'shape' ? 'wizard.area.clip.shapeHint' : 'wizard.area.clip.bboxHint')}</span>
      <label className="xc-check">
        <input type="checkbox" checked={area.clip === 'shape' && area.maskVariable} disabled={area.clip !== 'shape'} onChange={(event) => set({ maskVariable: event.target.checked })} />
        <span>{t('wizard.area.clip.mask')} <span className="xc-hint">{t('wizard.area.clip.maskHint')}</span></span>
      </label>
    </fieldset>
  );
}

type Pending = { name: string; file?: File; jobId?: string | number; choice: AreaChoice };

function ShapePanel({ area, set }: { area: AreaState; set: (patch: Partial<AreaState>) => void }) {
  const { lang, t } = useLanguage();
  const areas = useLoad<SavedArea[]>(() => generation.listAreas(), []);
  const [deleting, setDeleting] = useState<SavedArea | null>(null);
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null);
  const error = failure ? userMessage(failure.cause, lang) : '';
  const setError = (cause: unknown) => setFailure(cause === null ? null : { cause });
  // Notices are worded at render, so they follow a language switch too.
  const [notice, setNotice] = useState<{ key: 'savedNotice' | 'deleted'; name: string } | null>(null);
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
    setError(null);
    if (item.geojson) { set({ shape: item }); return; }
    try { set({ shape: await generation.getArea(item.id) }); } catch (cause) { setError(cause); }
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
    setNotice({ key: 'savedNotice', name: result.area.name });
    areas.reload();
    set({ shape: result.area, tab: 'shape' });
    if (!result.area.geojson) void select(result.area);
  };
  const run = async (source: Omit<Pending, 'choice'>, picked: AreaPick = {}) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = source.file ? await generation.uploadArea(source.file, source.name, picked) : await generation.areaFromJob(source.jobId!, source.name, picked);
      finish(result, source);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };
  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0];
    event.target.value = '';
    if (!next) return;
    setFile(next); setPending(null); setNotice(null);
    if (!name) setName(next.name.replace(/\.(zip|geojson|json)$/i, ''));
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await generation.deleteArea(deleting.id);
      if (area.shape && String(area.shape.id) === String(deleting.id)) set({ shape: null });
      setNotice({ key: 'deleted', name: deleting.name });
      areas.reload();
    } catch (cause) { setError(cause); }
    setDeleting(null);
  };
  const attrDef = pending?.choice.attributes.find((item) => item.name === attribute);
  const pickReady = pickKind === 'dissolve' || (!!attribute && !!attrValue.trim());

  return (
    <div className="area-panel">
      <div className="area-section">
        <strong className="area-section__title">{t('wizard.area.shape.saved')}</strong>
        {areas.loading ? <Skeleton lines={2} label={t('wizard.area.shape.loading')} /> : areas.error ? <Alert tone="danger" role="alert">{areas.error}</Alert> : !(areas.data ?? []).length ? (
          <EmptyState title={t('wizard.area.shape.emptyTitle')} text={t('wizard.area.shape.emptyText')} />
        ) : (
          <ul className="area-list" aria-label={t('wizard.area.shape.saved')}>
            {(areas.data ?? []).map((item) => {
              const on = area.shape?.id === item.id;
              return (
                <li key={item.id} className="area-saved">
                  <button type="button" aria-pressed={on} className={`area-item ${on ? 'is-on' : ''}`} onClick={() => select(item)}>
                    <AreaSketch bbox={item.bbox} geojson={item.geojson} width={96} height={64} className="area-thumb" label={t('wizard.area.thumb', { name: item.name })} />
                    <span className="xc-cell-main"><strong>{item.name}</strong><small className="tabular">{km2Text(item.areaKm2, lang)}</small></span>
                  </button>
                  <button type="button" className="xc-icon-btn" aria-label={t('wizard.area.shape.deleteNamed', { name: item.name })} onClick={() => setDeleting(item)}><Trash2 size={16} aria-hidden /></button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="area-section">
        <strong className="area-section__title">{t('wizard.area.shape.upload')}</strong>
        <div className="form-grid">
          <div className="xc-field">
            <span className="xc-label">{t('wizard.area.shape.zip')}</span>
            <div className="area-file">
              <input ref={fileInput} type="file" accept=".zip,.geojson,.json" hidden aria-label={t('wizard.area.shape.zipChoose')} onChange={chooseFile} />
              <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}><UploadCloud size={16} aria-hidden />{t(file ? 'wizard.file.chooseOther' : 'wizard.file.choose')}</Button>
              <span className="xc-hint">{file ? file.name : t('wizard.area.shape.zipHint')}</span>
            </div>
          </div>
          <TextField label={t('wizard.area.shape.name')} value={name} maxLength={100} placeholder={t('wizard.area.shape.namePlaceholder')} onChange={(event) => setName(event.target.value)} />
        </div>
        <div><Button size="sm" disabled={!file || !name.trim() || busy || !!pending} onClick={() => run({ file: file!, name: name.trim() })}>{busy && !pending ? <><Loader2 size={14} className="spin" aria-hidden />{t('wizard.area.shape.uploading')}</> : t('wizard.area.shape.save')}</Button></div>
      </div>

      {pending && (
        <fieldset className="area-fieldset" aria-label={t('wizard.area.shape.pickLabel')}>
          <legend className="xc-label">{pending.choice.polygonCount ? t('wizard.area.shape.polygons', { count: pending.choice.polygonCount }) : t('wizard.area.shape.polygonsMany')}</legend>
          <RadioGroup className="area-chips" label={t('wizard.area.shape.pickKind')}>
            <button type="button" role="radio" aria-checked={pickKind === 'dissolve'} className={`area-chip ${pickKind === 'dissolve' ? 'is-on' : ''}`} onClick={() => setPickKind('dissolve')}>{t('wizard.area.shape.dissolve')}</button>
            <button type="button" role="radio" aria-checked={pickKind === 'attribute'} className={`area-chip ${pickKind === 'attribute' ? 'is-on' : ''}`} onClick={() => setPickKind('attribute')}>{t('wizard.area.shape.byAttribute')}</button>
          </RadioGroup>
          {pickKind === 'attribute' && (
            <div className="form-grid">
              {pending.choice.attributes.length ? (
                <label className="xc-field">
                  <span className="xc-label">{t('wizard.area.shape.attribute')}</span>
                  <select className="xc-select" value={attribute} onChange={(event) => { setAttribute(event.target.value); const next = pending.choice.attributes.find((item) => item.name === event.target.value); setAttrValue(next?.values?.[0] != null ? String(next.values[0]) : ''); }}>
                    {pending.choice.attributes.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
                  </select>
                </label>
              ) : <TextField label={t('wizard.area.shape.attribute')} value={attribute} onChange={(event) => setAttribute(event.target.value)} placeholder={t('wizard.area.shape.attributePlaceholder')} />}
              {attrDef?.values?.length ? (
                <label className="xc-field">
                  <span className="xc-label">{t('wizard.area.shape.value')}</span>
                  <select className="xc-select" value={attrValue} onChange={(event) => setAttrValue(event.target.value)}>
                    {attrDef.values.map((value) => <option key={String(value)} value={String(value)}>{String(value)}</option>)}
                  </select>
                </label>
              ) : <TextField label={t('wizard.area.shape.value')} value={attrValue} onChange={(event) => setAttrValue(event.target.value)} placeholder={t('wizard.area.shape.valuePlaceholder')} />}
            </div>
          )}
          <div className="area-actions">
            <Button size="sm" disabled={!pickReady || busy} onClick={() => run(pending, pickKind === 'dissolve' ? { dissolve: true } : { attribute, value: attrValue.trim() })}>{busy ? <><Loader2 size={14} className="spin" aria-hidden />{t('wizard.area.shape.saving')}</> : t('wizard.area.shape.saveThis')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)} disabled={busy}>{t('common.cancel')}</Button>
          </div>
        </fieldset>
      )}

      <div className="area-section">
        <Button variant="secondary" size="sm" aria-expanded={fromJobOpen} onClick={() => setFromJobOpen((value) => !value)}>{t('wizard.area.shape.fromData')}</Button>
        {fromJobOpen && <FromJobs busy={busy} onImport={(job) => run({ jobId: job.id, name: job.name })} />}
      </div>

      {error && <Alert tone="danger" role="alert">{error}</Alert>}
      {notice && <Alert tone="success">{t(`wizard.area.shape.${notice.key}`, { name: notice.name })}</Alert>}
      {deleting && (
        <Dialog
          title={t('wizard.area.shape.deleteTitle')}
          role="alertdialog"
          size="sm"
          description={t('wizard.area.shape.deleteText', { name: deleting.name })}
          onClose={() => setDeleting(null)}
          footer={<><Button variant="secondary" onClick={() => setDeleting(null)}>{t('common.cancel')}</Button><Button variant="danger" onClick={confirmDelete}>{t('app.delete')}</Button></>}
        />
      )}
    </div>
  );
}

function FromJobs({ busy, onImport }: { busy: boolean; onImport: (job: JobSummary) => void }) {
  const { lang, t } = useLanguage();
  const jobs = useLoad<JobSummary[]>(() => generation.listJobs({ type: 'SHAPEFILE', status: 'SUCCEEDED' }), []);
  if (jobs.loading) return <Skeleton lines={2} label={t('wizard.area.shape.jobsLoading')} />;
  if (jobs.error) return <Alert tone="danger" role="alert">{jobs.error}</Alert>;
  const items = (jobs.data ?? []).filter((job) => job.status === 'SUCCEEDED');
  if (!items.length) return <p className="xc-hint">{t('wizard.area.shape.jobsEmpty')}</p>;
  return (
    <ul className="area-list" aria-label={t('wizard.area.shape.jobsLabel')}>
      {items.map((job) => (
        <li key={job.id} className="area-saved">
          <span className="xc-cell-main area-saved__text"><strong>{job.name}</strong><small>{job.createdAt ? formatDate(job.createdAt, {}, lang) : ''}</small></span>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onImport(job)} aria-label={t('wizard.area.shape.importNamed', { name: job.name })}>{t('wizard.area.shape.import')}</Button>
        </li>
      ))}
    </ul>
  );
}

/** Sentinel-1 pairing of the request (UR-41); absent when pairing is off. */
export type PairingView = { keepUnpaired: boolean };
const isNoMatch = (blocker: EstimateBlocker) => (typeof blocker === 'string' ? blocker : blocker.code) === 'NO_S1_MATCH';

export function EstimatePanel({ estimate, hint, compact, pairing, picked }: { estimate: EstimateView; hint?: string; compact?: boolean; pairing?: PairingView; picked?: string[] }) {
  const { lang, t } = useLanguage();
  const num = (value: number) => formatNumber(value, {}, lang);
  const { data } = estimate;
  const dates = estimateDates(data);
  // With a date list the totals follow the checked dates at once; older servers keep the plain estimate.
  const totals = data && dates ? selectionTotals(data, picked ?? dates.map((item) => item.date)) : null;
  const seconds = totals ? totals.seconds : data?.estimatedSeconds ?? null;
  // Requests scale with the picked dates like bytes and time do.
  const requests = data ? (totals && totals.total ? Math.ceil((data.requestTiles * totals.count) / totals.total) : data.requestTiles) : 0;
  const blockers = !data ? [] : pairing && dates ? withPairingBlockers(data, true) : data.blockers.filter((blocker) => !pairing || !isNoMatch(blocker));
  return (
    <section className={`area-estimate ${compact ? 'is-compact' : ''}`} aria-label={t('wizard.estimate.title')}>
      <h3 className="area-estimate__title"><Search size={14} aria-hidden /> {t('wizard.estimate.title')}</h3>
      {estimate.status === 'idle' && <p className="xc-hint">{hint || t('wizard.estimate.idle')}</p>}
      {estimate.status === 'loading' && <p className="xc-hint" role="status"><Loader2 size={14} className="spin" aria-hidden /> {t('wizard.estimate.loading')}</p>}
      {estimate.status === 'error' && <Alert tone="warning">{t('wizard.estimate.failed', { error: estimate.error ?? '' })}</Alert>}
      {data && (
        <>
          <dl className="meta-list area-estimate__list">
            <dt>{t('wizard.estimate.area')}</dt><dd className="tabular">{km2Text(data.areaKm2, lang)}</dd>
            <dt>{t('wizard.estimate.grid')}</dt><dd className="tabular">{num(data.grid.width)} × {num(data.grid.height)} px</dd>
            {totals ? (
              <>
                <dt>{t('wizard.estimate.times')}</dt>
                <dd className="tabular" data-testid="estimate-times">
                  {totals.count !== totals.total
                    ? <>{t('wizard.estimate.timesPicked', { count: num(totals.count) })}<span className="xc-hint">{t('wizard.estimate.ofTotal', { count: num(totals.total) })}</span></>
                    : t('wizard.estimate.timesValue', { count: num(totals.count) })}
                  {pairing && !pairing.keepUnpaired && totals.unpaired > 0 && <span className="xc-hint">{t('wizard.estimate.unpairedDropped', { count: totals.unpaired })}</span>}
                </dd>
                <dt>{t('wizard.estimate.scenes')}</dt><dd className="tabular">{t('wizard.estimate.scenesValue', { count: num(totals.scenes) })}</dd>
                <dt>{t('wizard.estimate.bytes')}</dt><dd className="tabular" data-testid="estimate-bytes">{formatBytes(totals.bytes)}</dd>
              </>
            ) : (
              <>
                <dt>{t('wizard.estimate.scenes')}</dt><dd className="tabular">{data.scenes == null ? t('wizard.estimate.unknown') : t('wizard.estimate.scenesValue', { count: num(data.scenes) })}</dd>
                <dt>{t('wizard.estimate.bytes')}</dt><dd className="tabular">{formatBytes(data.estimatedBytes)}</dd>
              </>
            )}
            {seconds != null && <><dt>{t('wizard.estimate.time')}</dt><dd className="tabular" data-testid="estimate-time">{minutesText(seconds, lang)}</dd></>}
          </dl>
          {isLong(seconds) && <p className="xc-hint">{t(dates ? 'wizard.estimate.fewerDates' : 'wizard.estimate.smaller')}</p>}
          {requests > 1 && <p className="xc-hint">{t('wizard.estimate.split', { count: num(requests) })}</p>}
          {estimateWarnings(data.warnings, totals, blockers.length > 0).map((warning) => <Alert key={warning} tone="warning">{warningText(warning, lang)}</Alert>)}
          {blockers.map((blocker, index) => <Alert key={index} tone="danger" role="alert">{blockerText(blocker, lang)}</Alert>)}
          {pairing && !dates && <PairTable data={data} keepUnpaired={pairing.keepUnpaired} />}
        </>
      )}
    </section>
  );
}
