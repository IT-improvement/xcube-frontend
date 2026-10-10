// S4 GEE step "영역" (UR-54): four ways to give the area of interest and a map that always shows the result.
// The size estimate (EstimatePanel) is shown on the "기간·날짜" step and, folded to three numbers, on the review.
import { Loader2, Search, Trash2, UploadCloud } from 'lucide-react';
import { ChangeEvent, Dispatch, KeyboardEvent, SetStateAction, useEffect, useRef, useState } from 'react';
import { AdminArea, AdminLevel, AreaChoice, AreaPick, AreaUpload, EstimateBlocker, JobSummary, SavedArea } from '../../api/generationApi';
import { userMessage } from '../../api/httpClient';
import { Alert, Button, TextField } from '../../components/ui';
import type { TextFieldProps } from '../../components/ui';
import { Badge, Dialog, EmptyState, RadioGroup, Skeleton, TabPanel, Tabs } from '../../components/ui/kit';
import { generation } from '../api';
import { formatBytes } from '../fusion';
import { useLoad } from '../useLoad';
import { codeText, formatDate, formatNumber, shownSentence, useLanguage } from '../../i18n';
import type { ServerItem } from '../../i18n';
import '../../i18n/wizard';
import AreaMap, { AreaSketch } from './AreaMap';
import { areaTabs, AreaState, AreaTab, bboxText, blockerText, estimateBlockers, estimateWarningItems, estimateWarnings, hasPolygonOptions, km2Text, ResolvedArea, SIZE_CHIPS, SIZE_LIMITS, warningText } from './areaModel';
import { PairTable } from './SarPairing';
import { estimateDates, isLong, minutesText, selectionTotals } from './dateModel';
import { withPairingBlockers } from './sarModel';
import { EstimateView } from './useGeeEstimate';

type Props = { area: AreaState; onChange: Dispatch<SetStateAction<AreaState>>; resolved: ResolvedArea; showErrors: boolean };
type Patch = (patch: Partial<AreaState>) => void;

/** Where the area's point mark goes: the centre in point mode. */
export const areaCenter = (area: AreaState, resolved: ResolvedArea): [number, number] | undefined =>
  area.tab === 'point' && resolved.bbox ? [Number(area.lon), Number(area.lat)] : undefined;

export default function AreaStep({ area, onChange, resolved, showErrors }: Props) {
  const { lang, t } = useLanguage();
  // Functional update: a coordinate committed late (blur, debounce) never undoes another one.
  const set: Patch = (patch) => onChange((current) => ({ ...current, ...patch }));
  const pick = area.tab === 'point' ? 'point' : area.tab === 'box' ? 'box' : null;
  const invalid = showErrors && !!resolved.error;
  return (
    <div className="area-step">
      <Tabs<AreaTab> label={t('wizard.area.tabsLabel')} idPrefix="area-mode" items={areaTabs(lang)} value={area.tab} onChange={(tab) => set({ tab })} />
      <div className="area-layout">
        <TabPanel idPrefix="area-mode" value={area.tab} className="area-controls">
          <div className="area-controls__body" data-invalid={invalid || undefined} aria-describedby={invalid ? 'area-error' : undefined}>
            {area.tab === 'point' && <PointPanel area={area} set={set} showErrors={showErrors} resolved={resolved} />}
            {area.tab === 'admin' && <AdminPanel area={area} set={set} />}
            {area.tab === 'box' && <BoxPanel area={area} set={set} />}
            {area.tab === 'shape' && <ShapePanel area={area} set={set} />}
          </div>
          {hasPolygonOptions(area.tab) && (area.tab === 'admin' ? area.admin : area.shape) && <PolygonOptions area={area} set={set} />}
          {invalid && <p className="xc-field__error" id="area-error">{resolved.error}</p>}
        </TabPanel>
        <div className="area-preview">
          <AreaMap
            bbox={resolved.bbox}
            geojson={area.tab === 'admin' || area.tab === 'shape' ? resolved.geojson : undefined}
            center={areaCenter(area, resolved)}
            pick={pick}
            describedBy="area-caption"
            onPoint={(lon, lat) => set({ tab: 'point', lon: String(lon), lat: String(lat) })}
            onBox={(bbox) => set({ tab: 'box', west: String(bbox[0]), south: String(bbox[1]), east: String(bbox[2]), north: String(bbox[3]) })}
          />
          <p className="area-caption tabular" id="area-caption" data-testid="area-preview" aria-live="polite">
            {resolved.bbox
              ? <><strong>{resolved.label}</strong><br />{bboxText(resolved.bbox, lang)}{resolved.areaKm2 != null && ` · ${km2Text(resolved.areaKm2, lang)}`}</>
              : <span className="xc-hint">{t(pick === 'point' ? 'wizard.area.pickPoint' : pick === 'box' ? 'wizard.area.pickBox' : 'wizard.area.pickAny')}</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Wait after the last keystroke before a typed coordinate counts (blur and Enter count at once). */
export const COMMIT_DELAY = 700;

/**
 * A number field whose value counts on blur, Enter or a short pause, not on every keystroke (UR-54 W2):
 * typing "127.63" asks for one estimate, not six. Values set from outside (a map click) show at once.
 */
function CommitField({ value, onCommit, ...props }: Omit<TextFieldProps, 'value' | 'onChange'> & { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => commit.current(draft), COMMIT_DELAY);
    return () => window.clearTimeout(timer);
  }, [draft, value]);
  const now = () => { if (draft !== value) commit.current(draft); };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') { event.preventDefault(); now(); } };
  return <TextField {...props} type="number" inputMode="decimal" autoComplete="off" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={now} onKeyDown={onKeyDown} />;
}

function PointPanel({ area, set, showErrors, resolved }: { area: AreaState; set: Patch; showErrors: boolean; resolved: ResolvedArea }) {
  const { t } = useLanguage();
  const customWrong = area.sizeChip === 'custom' && !!area.customSize && !!resolved.error && /km/.test(resolved.error);
  return (
    <div className="area-panel">
      <div className="form-grid">
        <CommitField label={t('wizard.area.point.lon')} step="any" placeholder={t('wizard.area.point.lonPlaceholder')} value={area.lon} onCommit={(lon) => set({ lon })} aria-invalid={showErrors && !area.lon.trim() ? true : undefined} />
        <CommitField label={t('wizard.area.point.lat')} step="any" placeholder={t('wizard.area.point.latPlaceholder')} value={area.lat} onCommit={(lat) => set({ lat })} aria-invalid={showErrors && !area.lat.trim() ? true : undefined} />
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
          <CommitField label={t('wizard.area.point.customLabel', SIZE_LIMITS)} step="any" min={SIZE_LIMITS.min} max={SIZE_LIMITS.max} value={area.customSize} onCommit={(customSize) => set({ customSize })} error={customWrong || (showErrors && !area.customSize) ? t('wizard.area.errors.size', SIZE_LIMITS) : undefined} />
        </>
      )}
    </div>
  );
}

function BoxPanel({ area, set }: { area: AreaState; set: Patch }) {
  const { t } = useLanguage();
  const example = (value: string) => t('wizard.area.box.example', { value });
  // The coordinates are open from the start: they are the keyboard way to set the box (the map needs a pointer).
  return (
    <div className="area-panel">
      <p className="xc-hint">{t('wizard.area.box.hint')}</p>
      <fieldset className="area-coords">
        <legend className="xc-label">{t('wizard.area.box.coords')}</legend>
        <div className="form-grid">
          <CommitField label={t('wizard.area.box.west')} step="any" placeholder={example('126.50')} value={area.west} onCommit={(west) => set({ west })} />
          <CommitField label={t('wizard.area.box.south')} step="any" placeholder={example('35.00')} value={area.south} onCommit={(south) => set({ south })} />
          <CommitField label={t('wizard.area.box.east')} step="any" placeholder={example('129.50')} value={area.east} onCommit={(east) => set({ east })} />
          <CommitField label={t('wizard.area.box.north')} step="any" placeholder={example('37.00')} value={area.north} onCommit={(north) => set({ north })} />
        </div>
      </fieldset>
    </div>
  );
}

const LEVELS: Array<{ id: AdminLevel | ''; key: 'all' | 'sido' | 'sigungu' }> = [{ id: '', key: 'all' }, { id: 'sido', key: 'sido' }, { id: 'sigungu', key: 'sigungu' }];
/** Hangul in a server sentence: an English screen shows its own wording instead (server texts get codes in stage 5). */

function AdminPanel({ area, set }: { area: AreaState; set: Patch }) {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<AdminLevel | ''>('');
  const { lang, t } = useLanguage();
  const [items, setItems] = useState<AdminArea[]>([]);
  // The boundary source: its code (`SGIS_ADMDONGKOR`, also before the first search); older servers send only the sentence.
  const [attribution, setAttribution] = useState<ServerItem>({ code: 'SGIS_ADMDONGKOR' });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null);
  const error = failure ? userMessage(failure.cause, lang) : '';
  // An older server's sentence without a code: Korean shows it; English, when it has Hangul, the known source.
  const attributionText = codeText(attribution.code, null, lang) ?? shownSentence(attribution.message, lang) ?? codeText('SGIS_ADMDONGKOR', null, lang);
  const [loadingCode, setLoadingCode] = useState('');

  useEffect(() => {
    const text = query.trim();
    if (!text) { setItems([]); setFailure(null); setBusy(false); return; }
    let cancelled = false;
    setBusy(true);
    const timer = window.setTimeout(() => {
      generation.searchAdminAreas(text, level || undefined)
        .then((result) => { if (cancelled) return; setItems(result.items); setFailure(null); if (result.attributionCode || result.attribution) setAttribution({ code: result.attributionCode, message: result.attribution }); })
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

function PolygonOptions({ area, set }: { area: AreaState; set: Patch }) {
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

function ShapePanel({ area, set }: { area: AreaState; set: Patch }) {
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

/** Whole seconds since `since`, ticking once a second while it is set. */
export function useElapsed(since?: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since == null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [since]);
  return since == null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}
/** After this many seconds the panel adds why it may take a while. */
const SLOW_SECONDS = 10;

/**
 * The size estimate. `compact` (review step) keeps the three numbers that decide it: dates, size, time.
 * While a new estimate is calculated the last one stays, dimmed, under "다시 계산 중 · n초" (no layout jump).
 */
export function EstimatePanel({ estimate, hint, compact, pairing, picked }: { estimate: EstimateView; hint?: string; compact?: boolean; pairing?: PairingView; picked?: string[] }) {
  const { lang, t } = useLanguage();
  const num = (value: number) => formatNumber(value, {}, lang);
  const { data, stale } = estimate;
  const loading = estimate.status === 'loading';
  const seconds = useElapsed(loading ? estimate.since : undefined);
  const dates = estimateDates(data);
  // With a date list the totals follow the checked dates at once; older servers keep the plain estimate.
  const totals = data && dates ? selectionTotals(data, picked ?? dates.map((item) => item.date)) : null;
  const time = totals ? totals.seconds : data?.estimatedSeconds ?? null;
  // Requests scale with the picked dates like bytes and time do.
  const requests = data ? (totals && totals.total ? Math.ceil((data.requestTiles * totals.count) / totals.total) : data.requestTiles) : 0;
  const blockers = !data ? [] : pairing && dates ? withPairingBlockers(data, true) : estimateBlockers(data).filter((blocker) => !pairing || !isNoMatch(blocker));
  const timesValue = totals && (
    <>
      {totals.count !== totals.total
        ? <>{t('wizard.estimate.timesPicked', { count: num(totals.count) })}<span className="xc-hint">{t('wizard.estimate.ofTotal', { count: num(totals.total) })}</span></>
        : t('wizard.estimate.timesValue', { count: num(totals.count) })}
      {pairing && !pairing.keepUnpaired && totals.unpaired > 0 && <span className="xc-hint">{t('wizard.estimate.unpairedDropped', { count: totals.unpaired })}</span>}
    </>
  );
  const bytes = totals ? totals.bytes : data?.estimatedBytes ?? 0;
  return (
    <section className={`area-estimate${compact ? ' is-compact' : ''}${loading && !data ? ' is-waiting' : ''}`} aria-label={t('wizard.estimate.title')}>
      <h3 className="area-estimate__title"><Search size={14} aria-hidden /> {t('wizard.estimate.title')}</h3>
      {estimate.status === 'idle' && <p className="xc-hint">{hint || t('wizard.estimate.idle')}</p>}
      {loading && (
        <p className="xc-hint area-estimate__busy tabular" role="status">
          <Loader2 size={14} className="spin" aria-hidden />
          {t(stale ? 'wizard.estimate.recalculating' : 'wizard.estimate.loadingFor', { seconds })}
          {seconds >= SLOW_SECONDS && <span> · {t('wizard.estimate.slow')}</span>}
        </p>
      )}
      {estimate.status === 'error' && <Alert tone="warning">{t('wizard.estimate.failed', { error: estimate.error ?? '' })}</Alert>}
      {data && (
        <div className={`area-estimate__body${stale ? ' is-stale' : ''}`} aria-busy={stale || undefined} data-testid="estimate-body">
          {compact ? (
            <dl className="meta-list area-estimate__list area-estimate__figures">
              <dt>{t('wizard.estimate.times')}</dt>
              <dd className="tabular" data-testid="estimate-times">{timesValue || (data.scenes == null ? t('wizard.estimate.unknown') : t('wizard.estimate.scenesValue', { count: num(data.scenes) }))}</dd>
              <dt>{t('wizard.estimate.bytes')}</dt><dd className="tabular" data-testid="estimate-bytes">{formatBytes(bytes)}</dd>
              <dt>{t('wizard.estimate.time')}</dt><dd className="tabular" data-testid="estimate-time">{minutesText(time, lang)}</dd>
            </dl>
          ) : (
            <>
              <dl className="meta-list area-estimate__list">
                <dt>{t('wizard.estimate.area')}</dt><dd className="tabular">{km2Text(data.areaKm2, lang)}</dd>
                {totals ? (
                  <>
                    <dt>{t('wizard.estimate.times')}</dt><dd className="tabular" data-testid="estimate-times">{timesValue}</dd>
                    <dt>{t('wizard.estimate.scenes')}</dt><dd className="tabular">{t('wizard.estimate.scenesValue', { count: num(totals.scenes) })}</dd>
                    <dt>{t('wizard.estimate.bytes')}</dt><dd className="tabular" data-testid="estimate-bytes">{formatBytes(totals.bytes)}</dd>
                  </>
                ) : (
                  <>
                    <dt>{t('wizard.estimate.scenes')}</dt><dd className="tabular">{data.scenes == null ? t('wizard.estimate.unknown') : t('wizard.estimate.scenesValue', { count: num(data.scenes) })}</dd>
                    <dt>{t('wizard.estimate.bytes')}</dt><dd className="tabular">{formatBytes(data.estimatedBytes)}</dd>
                  </>
                )}
                {time != null && <><dt>{t('wizard.estimate.time')}</dt><dd className="tabular" data-testid="estimate-time">{minutesText(time, lang)}</dd></>}
              </dl>
              {/* Grid size and request count matter to us, not to most users: one click away. */}
              <details className="area-estimate__more">
                <summary>{t('wizard.estimate.details')}</summary>
                <dl className="meta-list area-estimate__list">
                  <dt>{t('wizard.estimate.grid')}</dt><dd className="tabular">{num(data.grid.width)} × {num(data.grid.height)} px</dd>
                  <dt>{t('wizard.estimate.requests')}</dt><dd className="tabular">{num(requests)}</dd>
                </dl>
              </details>
              {isLong(time) && <p className="xc-hint">{t(dates ? 'wizard.estimate.fewerDates' : 'wizard.estimate.smaller')}</p>}
              {requests > 1 && <p className="xc-hint">{t('wizard.estimate.split')}</p>}
            </>
          )}
          {!compact && estimateWarnings(estimateWarningItems(data), totals, blockers.length > 0).map((warning, index) => <Alert key={index} tone="warning">{warningText(warning, lang)}</Alert>)}
          {blockers.map((blocker, index) => <Alert key={index} tone="danger" role="alert">{blockerText(blocker, lang)}</Alert>)}
          {!compact && pairing && !dates && <PairTable data={data} keepUnpaired={pairing.keepUnpaired} />}
        </div>
      )}
    </section>
  );
}
