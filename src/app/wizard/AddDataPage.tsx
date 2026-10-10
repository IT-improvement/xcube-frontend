// S4 data add wizard: method → source → inspection → settings → confirm.
// Replaces the Viewer's ZarrStudio panel (GeoTIFF/CAS500, Shapefile, GEE, Zarr register).
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CloudDownload, Database, Droplets, FileArchive, Globe2, Image, Loader2, Search, UploadCloud } from 'lucide-react';
import { ChangeEvent, DragEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, userMessage } from '../../api/httpClient';
import { ColorBarOption, GeeCollection, GenerationJob, InspectionField, JobSummary, SpatialInspection } from '../../api/generationApi';
import { Alert, Button, ButtonLink, TextField } from '../../components/ui';
import { Badge, Card, PageHeader, RadioGroup, Skeleton } from '../../components/ui/kit';
import { appApi, canEditProject, generation, viewerHref } from '../api';
import { BBoxMap } from '../pages/DatasetDetailPage';
import AreaStep, { EstimatePanel } from './AreaStep';
import { AreaState, bboxBounds, blockerText, emptyArea, resolveArea, ResolvedArea } from './areaModel';
import { useGeeEstimate } from './useGeeEstimate';
import { activeSelection, DateSelection, estimateDates, selectedDatesField, selectionProblem } from './dateModel';
import { useLoad } from '../useLoad';
import VariableStyleEditor, { autoRange, defaultChoice, toVariableSpecs, validateChoices, VariableChoice } from './VariableStyleEditor';
import { FixedVariables, SarOptions } from './SarPairing';
import { defaultSar, FIXED_NAMES, PRESET_GEE, isS2, orbitOption, pairingActive, presetSar, S2_COLLECTION, sarError, sarRequest, SarState, WATER_BANDS, WATER_NAME, withPairingBlockers } from './sarModel';
import { withStrong } from './strong';
import './wizard.css';
import { formatNumber, useLanguage, useT } from '../../i18n';
import type { Lang, TFunction, TKey } from '../../i18n';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
// The wizard's text (UR-53 stage 3) loads with the wizard chunk only; it brings the management part along.
import '../../i18n/wizard';

type Method = 'geotiff' | 'shape' | 'gee' | 'zarr';
type RasterKind = 'geotiff' | 'cas500';
type GeeParams = { startDate: string; endDate: string; maxCloudPercent: string; scaleMeters: string };
type Rgb = { red: string; green: string; blue: string };

const STEPS = ['method', 'source', 'inspection', 'settings', 'confirm'] as const;
/** Method cards; product names stay as they are, the rest comes from `wizard.method.*`. */
const METHODS: Array<{ id: Method; title?: string; icon: ReactNode; register?: boolean }> = [
  { id: 'geotiff', title: 'GeoTIFF / CAS500', icon: <Image size={22} /> },
  { id: 'shape', title: 'Shapefile', icon: <FileArchive size={22} /> },
  { id: 'gee', title: 'Google Earth Engine', icon: <Globe2 size={22} /> },
  { id: 'zarr', icon: <Database size={22} />, register: true },
];
const methodTitle = (item: (typeof METHODS)[number], t: TFunction) => item.title ?? t('wizard.method.zarrTitle');
const REQUIRED_SHAPE = ['.shp', '.shx', '.dbf', '.prj'];
const TERMINAL = ['SUCCEEDED', 'FAILED', 'CANCELLED'];
// Sensor IDs known to the normalisation registry (Backend technical guide). Others can be typed in.
const SENSORS: Array<{ id: string; label?: string }> = [
  { id: 'SENTINEL2_L2A', label: 'Sentinel-2 L2A' },
  { id: 'LANDSAT_C2_L2', label: 'Landsat Collection 2 L2' },
  { id: 'CAS500_1_L2' },
];
const sensorLabel = (item: (typeof SENSORS)[number], t: TFunction) => item.label ?? t('wizard.settings.sensorCas500');
// Workers read the time from file names: 14 digits (YYYYMMDDHHMMSS) for rasters, 6 digits (YYYYMM) for Shapefiles.
const hasTimeInName = (fileName: string, method: Method) => (method === 'shape' ? /\d{6}/ : /\d{14}/).test(fileName);
const JOB_STATUSES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'];

/** Preset "수체 분석용 S1+S2" (UR-41): S2 optical bands under the names the AI looks for, plus Sentinel-1 VV·VH and the JRC reference.
 *  Its title and text are `wizard.catalog.preset*`. */
// S2 L2A reflectance is stored as DN (×10,000); 0~3,000 shows land and water well.
const WATER_RANGE = { min: '0', max: '3000' };
/** Pairing on: S2 bands take the AI names (blue…swir) unless the user already renamed them; off: back to the band names. */
const renameForPairing = (choices: VariableChoice[], on: boolean) => choices.map((choice) => {
  const mapped = WATER_NAME[choice.source];
  if (!mapped) return choice;
  if (on && choice.name === choice.source) return { ...choice, name: mapped };
  if (!on && choice.name === mapped) return { ...choice, name: choice.source };
  return choice;
});
const sarSummary = (sar: SarState, t: TFunction, lang: Lang) =>
  t('wizard.sar.summary', { days: sar.maxDaysApart, orbit: orbitOption(sar.orbitPass, lang), unpaired: t(sar.keepUnpaired ? 'wizard.sar.summaryKept' : 'wizard.sar.summaryDropped') })
  + (sar.waterReference ? t('wizard.sar.summaryWater') : '');

const fieldsOf = (inspection: SpatialInspection | null): InspectionField[] =>
  inspection ? inspection.fields ?? inspection.bands.map((name) => ({ name })) : [];
/** The estimate does not depend on the dataset name, so it uses a fixed one: typing the name never re-estimates (request data, not shown). */
const ESTIMATE_NAME = '새 데이터';
/** After a job succeeds, keep asking for a while until the Backoffice registration (the new dataset id) shows up. */
const REGISTRATION_POLLS = 20;
/** Dataset id of a finished generation job, once the Backoffice registered it. */
export const registeredDatasetId = (job: GenerationJob | null) => {
  const id = (job as Partial<JobSummary> | null)?.registration?.datacubeId;
  return id == null || id === '' ? '' : String(id);
};

/** S4 data add wizard. "다른 데이터 추가" starts a fresh wizard (new state) without reloading the page. */
export default function AddDataPage() {
  useDocumentTitle(useT()('titles.addData'));
  const [run, setRun] = useState(0);
  return <AddDataWizard key={run} onRestart={() => setRun((value) => value + 1)} />;
}

function AddDataWizard({ onRestart }: { onRestart: () => void }) {
  const { lang, t } = useLanguage();
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<Method | null>(null);
  const [rasterKind, setRasterKind] = useState<RasterKind>('geotiff');
  const [inspection, setInspection] = useState<SpatialInspection | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [collectionId, setCollectionId] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [gee, setGee] = useState<GeeParams>({ startDate: '', endDate: '', maxCloudPercent: '20', scaleMeters: '30' });
  const [area, setArea] = useState<AreaState>(emptyArea);
  const [sar, setSar] = useState<SarState>(() => defaultSar());
  const [preset, setPreset] = useState(false);
  const [dateSel, setDateSel] = useState<DateSelection | null>(null);
  const [storageUri, setStorageUri] = useState('');
  const [name, setName] = useState('');
  const [choices, setChoices] = useState<VariableChoice[]>([]);
  const [resolution, setResolution] = useState('0.00025');
  const [sensor, setSensor] = useState('');
  const [customSensor, setCustomSensor] = useState('');
  const [obsDate, setObsDate] = useState('');
  const [nodata, setNodata] = useState('');
  const [rgbOn, setRgbOn] = useState(false);
  const [rgb, setRgb] = useState<Rgb>({ red: '', green: '', blue: '' });
  const [projectId, setProjectId] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [registeredId, setRegisteredId] = useState('');
  const colorBars = useLoad<ColorBarOption[]>(() => generation.colorBars(), []);
  const collections = useLoad<GeeCollection[]>(() => (method === 'gee' ? generation.collections() : Promise.resolve([])), [method]);
  const projects = useLoad(() => appApi.listProjects(), []);
  // Failures keep their cause and are worded at render, so they follow a language switch.
  const [inspectFailure, setInspectFailure] = useState<{ cause: unknown } | null>(null);
  const [submitFailure, setSubmitFailure] = useState<{ cause: unknown; noFileJobs: boolean } | null>(null);
  const inspectError = inspectFailure ? userMessage(inspectFailure.cause, lang) : '';
  const submitError = !submitFailure ? '' : submitFailure.noFileJobs ? t('wizard.file.serverUnavailable') : userMessage(submitFailure.cause, lang);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const registrationPolls = useRef(0);
  const done = !!job || !!registeredId;

  // Leaving the tab mid-way loses the inputs; ask first.
  useEffect(() => {
    if (step === 0 || done) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [step, done]);
  useEffect(() => { headingRef.current?.focus(); }, [step]);

  // Poll the generation job until it finishes and, when it succeeded, until the new dataset is registered.
  useEffect(() => {
    if (!job) return;
    const awaitingRegistration = job.status === 'SUCCEEDED' && !registeredDatasetId(job)
      && !(job as Partial<JobSummary>).registration?.error && registrationPolls.current < REGISTRATION_POLLS;
    if (TERMINAL.includes(job.status) && !awaitingRegistration) return;
    if (awaitingRegistration) registrationPolls.current += 1;
    const timer = window.setTimeout(() => {
      generation.getJob(job.id).then(setJob).catch(() => undefined);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [job]);

  const collection = collections.data?.find((item) => item.id === collectionId);
  const fields: InspectionField[] = useMemo(() => {
    if (method === 'gee') return (collection?.bands ?? []).map((band) => ({ name: typeof band === 'string' ? band : band.id ?? band.name }));
    return fieldsOf(inspection);
  }, [method, collection, inspection]);
  const resolved = useMemo(() => resolveArea(area, lang), [area, lang]);
  const datesOk = !!gee.startDate && !!gee.endDate && gee.startDate <= gee.endDate;
  const pairing = method === 'gee' && pairingActive(collectionId, sar);
  const sarFields = method === 'gee' ? sarRequest(collectionId, sar) : {};
  const estimateBands = choices.length ? choices.map((item) => item.source) : fields.map((field) => field.name);
  const estimateBody = method === 'gee' && step >= 1 && collectionId && datesOk && resolved.request && resolved.bbox
    ? { name: ESTIMATE_NAME, collectionId, bands: estimateBands, startDate: gee.startDate, endDate: gee.endDate, maxCloudPercent: Number(gee.maxCloudPercent), scaleMeters: Number(gee.scaleMeters), bounds: bboxBounds(resolved.bbox), area: resolved.request, bandStyles: [], ...sarFields }
    : null;
  const estimate = useGeeEstimate(estimateBody);
  const blockers = method === 'gee' ? withPairingBlockers(estimate.data, pairing) : [];
  // Date picking (UR-43): the picks belong to one area/period; changing either (a new date list) starts again from all dates.
  // Bands and what to do with unpaired dates do not change the list, so changing them keeps the picks.
  const { dropUnpaired, ...pairScope } = sarFields.sarPairing ?? { dropUnpaired: true };
  const dateScope = JSON.stringify([collectionId, gee.startDate, gee.endDate, gee.maxCloudPercent, resolved.request ?? null, pairScope]);
  useEffect(() => { setDateSel(null); }, [dateScope]);
  const estimateDateList = method === 'gee' ? estimateDates(estimate.data) : null;
  const dateSelection = method === 'gee' ? activeSelection(dateSel, dateScope, estimateDateList) : null;
  const dateProblem = selectionProblem(dateSelection, estimateDateList, pairing ? { keepUnpaired: sar.keepUnpaired } : null, lang);
  const pickDates = (picked: string[]) => { if (estimateDateList) setDateSel({ scope: dateScope, all: estimateDateList.map((item) => item.date), picked }); };
  // Dates and blockers come from the estimate, so a GEE request cannot go on before the estimate for these inputs is in.
  const estimatePending = method === 'gee' && step >= 1 && estimate.status !== 'ok';
  const estimateWait = !estimatePending ? '' : estimate.status === 'loading' ? t('wizard.estimate.waiting') : estimate.status === 'error' ? t('wizard.estimate.waitFailed') : '';
  const estimateHint = !collectionId ? t('wizard.catalog.required') : !datesOk ? t('wizard.gee.periodRequired') : resolved.error;
  const noun = method === 'shape' ? 'attribute' : 'band';
  const continuous = choices.filter((choice) => choice.kind === 'continuous');
  const rgbPossible = (method === 'gee' || method === 'geotiff') && continuous.length >= 3;
  const variableErrors = validateChoices(choices, colorBars.data ?? [], lang);
  const editableProjects = (projects.data ?? []).filter(canEditProject);
  // CAS500 and Shapefile get sensor/mode defaults on the server; a generic GeoTIFF needs them from the user.
  const genericRaster = method === 'geotiff' && rasterKind === 'geotiff';
  const sensorValue = sensor === 'custom' ? customSensor.trim() : sensor;
  const fileInputs = method === 'geotiff' || method === 'shape';
  const dateRequired = fileInputs && !(method === 'geotiff' && rasterKind === 'cas500') && !!inspection && !hasTimeInName(inspection.fileName, method!);

  const chooseMethod = (next: Method) => {
    if (next !== method) {
      setInspection(null); setInspectFailure(null); setChoices([]); setCollectionId(''); setRgbOn(false); setName(''); setSar(defaultSar()); setPreset(false);
    }
    setMethod(next);
  };
  const inspectFile = async (file: File) => {
    if (!method || method === 'gee' || method === 'zarr') return;
    const type = method === 'shape' ? 'shapefile' : rasterKind;
    setInspecting(true); setInspectFailure(null); setInspection(null); setChoices([]);
    try {
      const result = await generation.inspect(type, file);
      setInspection(result);
      if (!name) setName(result.fileName.replace(/\.(zip|tiff?)$/i, ''));
    } catch (cause) {
      setInspectFailure({ cause });
    } finally {
      setInspecting(false);
    }
  };

  const chooseCollection = (id: string) => {
    setPreset(false);
    if (id === collectionId) return;
    setCollectionId(id); setChoices([]); setRgbOn(false); setSar(defaultSar());
  };
  const choosePreset = () => {
    const bars = colorBars.data ?? [];
    setPreset(true); setCollectionId(S2_COLLECTION); setSar(presetSar()); setGee((current) => ({ ...current, ...PRESET_GEE }));
    setChoices(WATER_BANDS.map((band) => ({ ...defaultChoice({ name: band.source }, bars), name: band.name, ...WATER_RANGE })));
    setRgbOn(true); setRgb({ red: 'B4', green: 'B3', blue: 'B2' });
  };
  const changeSar = (nextSar: SarState) => {
    if (nextSar.enabled !== sar.enabled) setChoices((current) => renameForPairing(current, nextSar.enabled));
    if (!nextSar.enabled) setPreset(false);
    setSar(nextSar);
  };
  const changeChoices = (nextChoices: VariableChoice[]) => {
    // Newly picked S2 bands get the AI names while pairing is on.
    const known = new Set(choices.map((item) => item.source));
    const named = pairing ? nextChoices.map((item) => (known.has(item.source) ? item : renameForPairing([item], true)[0])) : nextChoices;
    setChoices(named);
    if (rgbOn && named.filter((item) => item.kind === 'continuous').length < 3) setRgbOn(false);
  };

  const stepValid = (index: number): string => {
    if (index === 0) return method ? '' : t('wizard.method.required');
    if (index === 1) {
      if (method === 'gee') {
        if (!collectionId) return t('wizard.catalog.required');
        if (!gee.startDate || !gee.endDate) return t('wizard.gee.periodRequired');
        if (gee.startDate > gee.endDate) return t('wizard.gee.periodOrder');
        if (resolved.error) return resolved.error;
        if (pairing && sarError(sar, lang)) return sarError(sar, lang);
        if (estimatePending) return estimateWait || t('wizard.estimate.notYet');
        if (blockers.length) return blockerText(blockers[0], lang);
        if (dateProblem) return dateProblem;
        return '';
      }
      if (method === 'zarr') return storageUri.trim() ? '' : t('wizard.zarr.required');
      return inspection ? '' : t(inspecting ? 'wizard.file.busy' : 'wizard.file.required');
    }
    if (index === 3) {
      if (!name.trim()) return t('wizard.settings.nameRequired');
      if (!choices.length) return t(noun === 'attribute' ? 'wizard.settings.pickAttributes' : 'wizard.settings.pickBands');
      if (Object.keys(variableErrors).length) return t('wizard.settings.checkStyle');
      if (pairing && choices.some((choice) => (FIXED_NAMES as readonly string[]).includes(choice.name.trim()))) return t('wizard.settings.fixedNames', { names: FIXED_NAMES.join('·') });
      if (method === 'shape' && !(Number(resolution) > 0)) return t('wizard.settings.resolutionCheck');
      if (genericRaster && !sensorValue) return t('wizard.settings.sensorRequired');
      if (dateRequired && !obsDate) return t('wizard.settings.obsDateMissing');
      if (nodata !== '' && !Number.isFinite(Number(nodata))) return t('wizard.settings.nodataNumber');
      if (rgbOn && rgbPossible && !(rgb.red && rgb.green && rgb.blue)) return t('wizard.rgb.required');
      if (method !== 'zarr' && !colorBars.data?.length) return t('wizard.settings.colorBarsMissing');
    }
    return '';
  };
  const next = () => {
    const problem = stepValid(step);
    if (problem) { setShowErrors(true); return; }
    setShowErrors(false);
    setStep((value) => Math.min(STEPS.length - 1, value + 1));
  };
  const back = () => { setShowErrors(false); setStep((value) => Math.max(0, value - 1)); };

  const submit = async () => {
    setSubmitting(true); setSubmitFailure(null);
    const specs = toVariableSpecs(choices);
    const channel = (source: string) => {
      const choice = choices.find((item) => item.source === source)!;
      return { variable: source, valueMin: Number(choice.min), valueMax: Number(choice.max) };
    };
    const rgbStyle = rgbOn && rgbPossible ? { red: channel(rgb.red), green: channel(rgb.green), blue: channel(rgb.blue) } : undefined;
    try {
      if (method === 'gee') {
        setJob(await generation.createGeeJob({
          name: name.trim(), collectionId, bands: choices.map((item) => item.source), startDate: gee.startDate, endDate: gee.endDate,
          maxCloudPercent: Number(gee.maxCloudPercent), scaleMeters: Number(gee.scaleMeters),
          bounds: bboxBounds(resolved.bbox!), area: resolved.request,
          bandStyles: choices.map((item) => ({ variable: item.source, colorBar: item.colorBar, valueMin: Number(item.min), valueMax: Number(item.max) })),
          rgbStyle,
          ...(pairing ? { variables: specs } : {}),
          ...sarFields,
          ...selectedDatesField(dateSelection),
        }));
      } else if (method === 'zarr') {
        const dataset = await appApi.registerDataset({
          name: name.trim(), storageUri: storageUri.trim(),
          metadata: { defaultVariable: specs[0]?.name, variables: specs.map((item) => item.name), bandStyles: specs.map((item) => ({ variable: item.name, colorBar: item.style.colorBar, valueMin: item.style.min, valueMax: item.style.max, kind: item.kind })) },
        });
        if (projectId) await appApi.linkDataset(projectId, dataset.id);
        setRegisteredId(dataset.id);
      } else {
        setJob(await generation.createFileJob({
          type: method === 'shape' ? 'SHAPEFILE' : rasterKind === 'cas500' ? 'CAS500' : 'GEOTIFF_BANDS',
          name: name.trim(), inputs: inspection?.inputs ?? [], variables: specs,
          params: {
            ...(method === 'shape' ? { resolution: Number(resolution) } : {}),
            ...(genericRaster ? { sensor: sensorValue } : {}),
            ...(obsDate ? { date: obsDate } : {}),
            ...(nodata !== '' ? { nodata: Number(nodata) } : {}),
            ...(rgbStyle ? { rgbStyle } : {}),
          },
          ...(projectId ? { projectId } : {}),
        }));
      }
    } catch (cause) {
      setSubmitFailure({ cause, noFileJobs: cause instanceof ApiError && cause.status === 404 && method !== 'gee' && method !== 'zarr' });
    } finally {
      setSubmitting(false);
    }
  };

  if (done) return <Result job={job} registeredId={registeredId} name={name} projectLinked={!!projectId && method !== 'zarr'} onRestart={onRestart} />;
  const problem = showErrors ? stepValid(step) : '';

  return (
    <div className="page-stack wizard">
      <PageHeader back={<Link className="page-back" to="/app/data"><ArrowLeft size={16} aria-hidden />{t('wizard.back')}</Link>} title={t('wizard.title')} description={t('wizard.description')} />
      <ol className="wizard-steps" aria-label={t('wizard.steps.label')}>
        {STEPS.map((id, index) => (
          <li key={id} className={index === step ? 'is-current' : index < step ? 'is-done' : ''} aria-current={index === step ? 'step' : undefined}>
            <span className="wizard-steps__dot">{index < step ? <Check size={14} aria-hidden /> : index + 1}</span>
            <span className="wizard-steps__label">{t(`wizard.steps.${id}`)}</span>
          </li>
        ))}
      </ol>

      <Card className="wizard-card">
        <div className="wizard-body">
          <h2 className="wizard-title" ref={headingRef} tabIndex={-1}>{t(`wizard.steps.${STEPS[step]}`)}</h2>

          {step === 0 && (
            <RadioGroup className="method-grid" label={t('wizard.method.label')}>
              {METHODS.map((item) => (
                <button key={item.id} type="button" role="radio" aria-checked={method === item.id} className={`method-card ${method === item.id ? 'is-on' : ''}`} onClick={() => chooseMethod(item.id)}>
                  <span className="method-card__icon" aria-hidden>{item.icon}</span>
                  <span className="method-card__text">
                    <span className="method-card__title">{methodTitle(item, t)} <Badge tone={item.register ? 'neutral' : 'primary'}>{t(item.register ? 'wizard.method.groupRegister' : 'wizard.method.groupCreate')}</Badge></span>
                    <span>{t(`wizard.method.${item.id}Text` as TKey)}</span>
                    <small>{t(`wizard.method.${item.id}Hint` as TKey)}</small>
                  </span>
                  <span className="method-card__check" aria-hidden>{method === item.id && <Check size={12} strokeWidth={3} />}</span>
                </button>
              ))}
            </RadioGroup>
          )}

          {step === 1 && (method === 'geotiff' || method === 'shape') && (
            <div className="wizard-section">
              {method === 'geotiff' && (
                <div className="xc-field">
                  <span className="xc-label">{t('wizard.file.kind')}</span>
                  <div className="segmented" role="group" aria-label={t('wizard.file.kind')}>
                    <button type="button" aria-pressed={rasterKind === 'geotiff'} onClick={() => { setRasterKind('geotiff'); setInspection(null); setChoices([]); }}>{t('wizard.file.geotiff')}</button>
                    <button type="button" aria-pressed={rasterKind === 'cas500'} onClick={() => { setRasterKind('cas500'); setInspection(null); setChoices([]); }}>{t('wizard.file.cas500')}</button>
                  </div>
                </div>
              )}
              <FileDrop
                accept={method === 'shape' || rasterKind === 'cas500' ? '.zip,application/zip' : '.tif,.tiff,image/tiff'}
                title={t(method === 'shape' ? 'wizard.file.dropShape' : rasterKind === 'cas500' ? 'wizard.file.dropCas500' : 'wizard.file.dropGeotiff')}
                hint={t(method === 'shape' ? 'wizard.file.hintShape' : rasterKind === 'cas500' ? 'wizard.file.hintCas500' : 'wizard.file.hintGeotiff')}
                busy={inspecting}
                fileName={inspection?.fileName}
                onFile={inspectFile}
              />
              {inspectError && <Alert tone="danger">{t('wizard.file.inspectFailed', { error: inspectError })}</Alert>}
              {inspection && <Alert tone="success">{inspection.message}</Alert>}
            </div>
          )}

          {step === 1 && method === 'gee' && (
            <div className="wizard-section">
              <div className="catalog">
                <p className="xc-hint">{t('wizard.catalog.hint')}</p>
                <label className="toolbar__search" style={{ maxWidth: 'none' }}>
                  <Search size={16} aria-hidden />
                  <input type="search" value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder={t('wizard.catalog.searchPlaceholder')} aria-label={t('wizard.catalog.searchLabel')} />
                </label>
                {collections.loading ? <Skeleton lines={3} label={t('wizard.catalog.loading')} /> : collections.error ? (
                  <Alert tone="danger">{t('wizard.catalog.failed', { error: collections.error })}</Alert>
                ) : (
                  <RadioGroup className="catalog__list" label={t('wizard.catalog.label')}>
                    {(collections.data ?? []).some((item) => item.id === S2_COLLECTION) && [t('wizard.catalog.presetTitle'), t('wizard.catalog.presetText'), t('wizard.catalog.presetKeywords')].some((text) => text.toLowerCase().includes(catalogQuery.trim().toLowerCase())) && (
                      <>
                        <button type="button" role="radio" aria-checked={preset} className={`catalog__item ${preset ? 'is-on' : ''}`} onClick={choosePreset}>
                          <span className="xc-cell-main"><strong>{t('wizard.catalog.presetTitle')}</strong><small>{t('wizard.catalog.presetText')}</small></span>
                          <Badge><Droplets size={12} aria-hidden /> {t('wizard.catalog.preset')}</Badge>
                        </button>
                        <p className="catalog__group" aria-hidden>{t('wizard.catalog.group')}</p>
                      </>
                    )}
                    {(collections.data ?? []).filter((item) => [item.id, item.name, item.title].some((text) => text?.toLowerCase().includes(catalogQuery.trim().toLowerCase()))).map((item) => (
                      <button key={item.id} type="button" role="radio" aria-checked={!preset && collectionId === item.id} className={`catalog__item ${!preset && collectionId === item.id ? 'is-on' : ''}`} onClick={() => chooseCollection(item.id)}>
                        <span className="xc-cell-main"><strong>{item.title || item.name || item.id}</strong><small>{item.id}</small></span>
                        <Badge>{t('wizard.catalog.bandCount', { count: item.bands.length })}</Badge>
                      </button>
                    ))}
                  </RadioGroup>
                )}
              </div>
              {isS2(collectionId) && <SarOptions sar={sar} onChange={changeSar} showErrors={showErrors} />}
              <div className="form-grid">
                <TextField label={t('wizard.gee.startDate')} type="date" value={gee.startDate} onChange={(event) => setGee({ ...gee, startDate: event.target.value })} />
                <TextField label={t('wizard.gee.endDate')} type="date" value={gee.endDate} onChange={(event) => setGee({ ...gee, endDate: event.target.value })} />
                <TextField label={t('wizard.gee.maxCloud')} type="number" min={0} max={100} value={gee.maxCloudPercent} onChange={(event) => setGee({ ...gee, maxCloudPercent: event.target.value })} />
                <TextField label={t('wizard.gee.pixelSize')} type="number" min={10} max={10000} value={gee.scaleMeters} onChange={(event) => setGee({ ...gee, scaleMeters: event.target.value })} />
              </div>
              <AreaStep area={area} onChange={setArea} resolved={resolved} estimate={estimate} estimateHint={estimateHint} showErrors={showErrors} pairing={pairing ? { keepUnpaired: sar.keepUnpaired } : undefined} dates={dateSelection ? { picked: dateSelection.picked, onChange: pickDates } : undefined} />
            </div>
          )}

          {step === 1 && method === 'zarr' && (
            <div className="wizard-section">
              <TextField label={t('wizard.zarr.uri')} placeholder={t('wizard.zarr.placeholder')} value={storageUri} onChange={(event) => setStorageUri(event.target.value)} help={t('wizard.zarr.help')} />
            </div>
          )}

          {step === 2 && <InspectionSummary method={method!} rasterKind={rasterKind} inspection={inspection} collection={collection} gee={gee} resolved={resolved} storageUri={storageUri} fields={fields} sarText={pairing ? sarSummary(sar, t, lang) : ''} />}

          {step === 3 && (
            <div className="wizard-section">
              <div className="form-grid">
                <TextField label={t('wizard.settings.name')} value={name} maxLength={150} placeholder={t('wizard.settings.namePlaceholder')} onChange={(event) => setName(event.target.value)} error={showErrors && !name.trim() ? t('wizard.settings.nameRequired') : undefined} />
                <label className="xc-field">
                  <span className="xc-label">{t('wizard.settings.project')} <span className="xc-hint">{t('wizard.settings.optional')}</span></span>
                  <select className="xc-select" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                    <option value="">{t('app.noProject')}</option>
                    {editableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </label>
                {method === 'shape' && <TextField label={t('wizard.settings.resolution')} type="number" step="0.000001" min={0.000001} value={resolution} onChange={(event) => setResolution(event.target.value)} help={t('wizard.settings.resolutionHelp')} />}
                {genericRaster && (
                  <label className="xc-field">
                    <span className="xc-label">{t('wizard.settings.sensor')}</span>
                    <select className="xc-select" aria-label={t('wizard.settings.sensor')} value={sensor} onChange={(event) => setSensor(event.target.value)} aria-invalid={showErrors && !sensorValue ? true : undefined}>
                      <option value="">{t('wizard.settings.choose')}</option>
                      {SENSORS.map((item) => <option key={item.id} value={item.id}>{sensorLabel(item, t)}</option>)}
                      <option value="custom">{t('wizard.settings.sensorOther')}</option>
                    </select>
                    <span className="xc-hint">{t('wizard.settings.sensorHint')}</span>
                  </label>
                )}
                {genericRaster && sensor === 'custom' && <TextField label={t('wizard.settings.sensorName')} placeholder={t('wizard.settings.sensorNamePlaceholder')} value={customSensor} maxLength={64} onChange={(event) => setCustomSensor(event.target.value.toUpperCase())} error={showErrors && !customSensor.trim() ? t('wizard.settings.sensorNameRequired') : undefined} />}
                {fileInputs && !(method === 'geotiff' && rasterKind === 'cas500') && (
                  <TextField
                    label={t(dateRequired ? 'wizard.settings.obsDate' : 'wizard.settings.obsDateOptional')}
                    type="date"
                    value={obsDate}
                    onChange={(event) => setObsDate(event.target.value)}
                    help={dateRequired ? t('wizard.settings.obsDateNeeded', { pattern: method === 'shape' ? 'YYYYMM' : 'YYYYMMDDHHMMSS' }) : t('wizard.settings.obsDateHelp')}
                    error={showErrors && dateRequired && !obsDate ? t('wizard.settings.obsDateRequired') : undefined}
                  />
                )}
                {fileInputs && <TextField label={t('wizard.settings.nodata')} type="number" step="any" value={nodata} onChange={(event) => setNodata(event.target.value)} help={t('wizard.settings.nodataHelp')} />}
              </div>
              {colorBars.error && method !== 'zarr' && <Alert tone="danger">{t('wizard.settings.colorBarsFailed', { error: colorBars.error })}</Alert>}
              <VariableStyleEditor
                fields={method === 'zarr' ? [] : fields}
                value={choices}
                onChange={changeChoices}
                colorBars={colorBars.data ?? []}
                noun={noun}
                allowCustom={method === 'zarr'}
                renamable={method !== 'gee' || pairing}
                continuousOnly={method === 'gee'}
                errors={showErrors ? variableErrors : {}}
              />
              {pairing && <FixedVariables waterReference={sar.waterReference} />}
              {rgbPossible && (
                <div className="rgb-box">
                  <label className="xc-check"><input type="checkbox" checked={rgbOn} onChange={(event) => setRgbOn(event.target.checked)} /><span><strong>{t('wizard.rgb.toggle')}</strong> <span className="xc-hint">{t('wizard.rgb.hint')}</span></span></label>
                  {rgbOn && (
                    <div className="form-grid">
                      {(['red', 'green', 'blue'] as const).map((channel) => (
                        <label className="xc-field" key={channel}>
                          <span className="xc-label">{t(`wizard.rgb.${channel}`)}</span>
                          <select className="xc-select" value={rgb[channel]} onChange={(event) => setRgb({ ...rgb, [channel]: event.target.value })}>
                            <option value="">{t('wizard.rgb.pick')}</option>
                            {continuous.map((choice) => <option key={choice.source} value={choice.source}>{choice.source}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="wizard-section">
              <dl className="meta-list summary-list">
                <dt>{t('wizard.summary.method')}</dt><dd>{methodTitle(METHODS.find((item) => item.id === method)!, t)}{method === 'geotiff' ? ` · ${rasterKind === 'cas500' ? 'CAS500' : t('wizard.file.geotiff')}` : ''}</dd>
                <dt>{t('wizard.summary.source')}</dt><dd>{method === 'gee' ? `${collection?.title || collection?.name || collectionId} · ${t('wizard.summary.period', { start: gee.startDate, end: gee.endDate })}` : method === 'zarr' ? storageUri : inspection?.fileName}</dd>
                {pairing && <><dt>{t('wizard.summary.radarPair')}</dt><dd>{sarSummary(sar, t, lang)}</dd></>}
                {method === 'gee' && dateSelection && (
                  <>
                    <dt>{t('wizard.summary.dates')}</dt>
                    <dd>
                      <span className="tabular">{t('wizard.summary.datesValue', { picked: dateSelection.picked.length, count: dateSelection.all.length })}</span>
                      {dateSelection.picked.length > 0 && (
                        <details className="summary-dates">
                          <summary>{t('wizard.summary.showDates')}</summary>
                          <ul aria-label={t('wizard.summary.pickedDates')}>{[...dateSelection.picked].sort().map((date) => <li key={date} className="tabular">{date}</li>)}</ul>
                        </details>
                      )}
                    </dd>
                  </>
                )}
                {method === 'gee' && <><dt>{t('wizard.summary.area')}</dt><dd>{resolved.modeLabel} · {resolved.label}<br /><span className="xc-hint">{resolved.clipLabel}{resolved.request?.maskVariable ? ` · ${t('wizard.summary.maskSaved')}` : ''}</span></dd></>}
                <dt>{t('wizard.summary.name')}</dt><dd>{name}</dd>
                <dt>{t('wizard.summary.project')}</dt><dd>{editableProjects.find((item) => item.id === projectId)?.name ?? t('app.noProject')}</dd>
                <dt>{t('wizard.summary.variables')}</dt>
                <dd>
                  <ul className="summary-vars">
                    {choices.map((choice) => (
                      <li key={choice.source}>
                        <strong>{choice.name}</strong>
                        {choice.name !== choice.source && <span className="xc-hint"> ← {choice.source}</span>}
                        <span className="xc-hint"> · {choice.colorBar} · {choice.kind === 'continuous' ? t('wizard.summary.range', { min: choice.min, max: choice.max }) : t('wizard.summary.categorical')}</span>
                      </li>
                    ))}
                    {pairing && ['vv', 'vh', ...(sar.waterReference ? ['water_gt'] : [])].map((fixed) => (
                      <li key={fixed}><strong>{fixed}</strong><span className="xc-hint"> · {t(fixed === 'water_gt' ? 'wizard.summary.waterRef' : 'wizard.summary.radar')}</span></li>
                    ))}
                  </ul>
                </dd>
                {rgbOn && rgbPossible && <><dt>RGB</dt><dd>R {rgb.red} · G {rgb.green} · B {rgb.blue}</dd></>}
                {method === 'shape' && <><dt>{t('wizard.summary.resolution')}</dt><dd>{resolution}°</dd></>}
                {genericRaster && <><dt>{t('wizard.summary.sensor')}</dt><dd>{(() => { const known = SENSORS.find((item) => item.id === sensorValue); return known ? sensorLabel(known, t) : sensorValue; })()}</dd></>}
                {obsDate && <><dt>{t('wizard.summary.obsDate')}</dt><dd>{obsDate}</dd></>}
                {nodata !== '' && <><dt>nodata</dt><dd>{nodata}</dd></>}
              </dl>
              {method === 'gee' && <EstimatePanel estimate={estimate} compact pairing={pairing ? { keepUnpaired: sar.keepUnpaired } : undefined} picked={dateSelection?.picked} />}
              {method === 'gee' && dateProblem && <Alert tone="warning" role="alert">{dateProblem}</Alert>}
              {submitError && <Alert tone="danger">{submitError}</Alert>}
            </div>
          )}

          {problem && <Alert tone="warning">{problem}</Alert>}
        </div>
        <div className="wizard-foot">
          <Button variant="secondary" onClick={back} disabled={step === 0 || submitting}><ArrowLeft size={16} aria-hidden />{t('wizard.nav.prev')}</Button>
          <span className="xc-hint">{step + 1} / {STEPS.length}</span>
          {estimateWait && (step === 1 || step === STEPS.length - 1) && (
            <span className="xc-hint wizard-foot__wait" role="status" id="estimate-wait">
              {estimate.status === 'loading' && <Loader2 size={14} className="spin" aria-hidden />}{estimateWait}
              {estimate.retry && <Button variant="line" size="sm" onClick={estimate.retry}>{t('wizard.estimate.recalculate')}</Button>}
            </span>
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={next} disabled={inspecting || (step === 1 && !!estimateWait) || (step === 1 && (blockers.length > 0 || !!dateProblem))} aria-describedby={estimateWait ? 'estimate-wait' : undefined}>{t('wizard.nav.next')}<ArrowRight size={16} aria-hidden /></Button>
          ) : (
            <Button onClick={submit} disabled={submitting || estimatePending || blockers.length > 0 || !!dateProblem} aria-describedby={estimateWait ? 'estimate-wait' : undefined}>{submitting ? <><Loader2 size={16} className="spin" aria-hidden />{t('wizard.nav.submitting')}</> : t(method === 'zarr' ? 'wizard.nav.register' : 'wizard.nav.create')}</Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function FileDrop({ accept, title, hint, busy, fileName, onFile }: { accept: string; title: string; hint: string; busy: boolean; fileName?: string; onFile: (file: File) => void }) {
  const t = useT();
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const take = (file?: File) => { if (file) onFile(file); };
  const onDrop = (event: DragEvent) => { event.preventDefault(); setOver(false); take(event.dataTransfer.files?.[0]); };
  return (
    <div className={`file-drop ${over ? 'is-over' : ''}`} onDragOver={(event) => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <span className="file-drop__icon" aria-hidden>{busy ? <Loader2 size={24} className="spin" /> : <UploadCloud size={24} />}</span>
      <strong>{busy ? t('wizard.file.inspecting') : fileName ? fileName : title}</strong>
      <small>{hint}</small>
      <input ref={inputRef} type="file" accept={accept} hidden onChange={(event: ChangeEvent<HTMLInputElement>) => { take(event.target.files?.[0]); event.target.value = ''; }} aria-label={t('wizard.file.choose')} />
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>{t(fileName ? 'wizard.file.chooseOther' : 'wizard.file.choose')}</Button>
    </div>
  );
}

function InspectionSummary({ method, rasterKind, inspection, collection, gee, resolved, storageUri, fields, sarText }: { method: Method; rasterKind: RasterKind; inspection: SpatialInspection | null; collection?: GeeCollection; gee: GeeParams; resolved: ResolvedArea; storageUri: string; fields: InspectionField[]; sarText: string }) {
  const { lang, t } = useLanguage();
  if (method === 'zarr') {
    return <div className="wizard-section"><Alert>{withStrong(t, 'wizard.inspect.zarrNote', 'path', storageUri)}</Alert></div>;
  }
  if (method === 'gee') {
    return (
      <div className="wizard-section">
        <div className="inspect-grid">
          {resolved.bbox && <BBoxMap bbox={resolved.bbox} />}
          <dl className="meta-list">
            <dt>{t('wizard.inspect.collection')}</dt><dd>{collection?.title || collection?.name}<br /><span className="xc-hint">{collection?.id}</span></dd>
            <dt>{t('wizard.inspect.period')}</dt><dd className="tabular">{t('wizard.summary.period', { start: gee.startDate, end: gee.endDate })}</dd>
            <dt>{t('wizard.inspect.area')}</dt><dd>{resolved.modeLabel} · {resolved.label}<br /><span className="xc-hint">{resolved.clipLabel}</span></dd>
            <dt>{t('wizard.inspect.pixelSize')}</dt><dd>{t('wizard.inspect.pixelValue', { scale: gee.scaleMeters, cloud: gee.maxCloudPercent })}</dd>
            <dt>{t('wizard.inspect.bands')}</dt><dd>{t('wizard.inspect.bandCount', { count: fields.length })}</dd>
            {sarText && <><dt>{t('wizard.inspect.radarPair')}</dt><dd>{sarText}<br /><span className="xc-hint">{t('wizard.inspect.radarPairHint')}</span></dd></>}
            <dt>{t('wizard.inspect.crs')}</dt><dd>{t('wizard.inspect.crsStored')}</dd>
          </dl>
        </div>
        <Alert>{t('wizard.inspect.geeNote')}</Alert>
      </div>
    );
  }
  if (!inspection) return <Alert tone="warning">{t('wizard.inspect.missing')}</Alert>;
  const bounds = inspection.bounds;
  const lower = inspection.files.map((file) => file.toLowerCase());
  return (
    <div className="wizard-section">
      <div className="inspect-grid">
        {bounds ? <BBoxMap bbox={[bounds.west, bounds.south, bounds.east, bounds.north]} /> : <div className="xc-hint" style={{ padding: 20 }}>{t('wizard.inspect.noBounds')}</div>}
        <dl className="meta-list">
          <dt>{t('wizard.inspect.file')}</dt><dd>{inspection.fileName}</dd>
          <dt>{t('wizard.inspect.kind')}</dt><dd>{method === 'shape' ? 'Shapefile' : rasterKind === 'cas500' ? 'CAS500' : 'GeoTIFF'}</dd>
          <dt>{t('wizard.inspect.extent')}</dt><dd className="tabular">{bounds ? `${bounds.west.toFixed(4)}, ${bounds.south.toFixed(4)} → ${bounds.east.toFixed(4)}, ${bounds.north.toFixed(4)}` : '—'}</dd>
          {inspection.width && <><dt>{t('wizard.inspect.size')}</dt><dd className="tabular">{formatNumber(inspection.width, {}, lang)} × {inspection.height != null ? formatNumber(inspection.height, {}, lang) : ''} px</dd></>}
          <dt>{t(method === 'shape' ? 'wizard.inspect.attributes' : 'wizard.inspect.bands')}</dt><dd>{t('wizard.inspect.fieldsValue', { count: fields.length, names: fields.map((field) => field.name).join(', ') })}</dd>
          <dt>{t('wizard.inspect.crs')}</dt><dd>{t('wizard.inspect.crsConverted')}</dd>
        </dl>
      </div>
      {method === 'shape' && (
        <ul className="checklist" aria-label={t('wizard.inspect.requiredFiles')}>
          {REQUIRED_SHAPE.map((ext) => {
            const ok = lower.some((file) => file.endsWith(ext));
            return <li key={ext} className={ok ? 'ok' : 'missing'}>{ok ? <CheckCircle2 size={16} aria-hidden /> : <CloudDownload size={16} aria-hidden />}{t(ok ? 'wizard.inspect.present' : 'wizard.inspect.absent', { ext })}</li>;
          })}
        </ul>
      )}
      {fields.some((field) => autoRange(field.approxStats)) ? (
        <Alert tone="success">{t('wizard.inspect.rangeAuto')}</Alert>
      ) : (
        <Alert>{t('wizard.inspect.rangeManual')}</Alert>
      )}
    </div>
  );
}

function Result({ job, registeredId, name, projectLinked, onRestart }: { job: GenerationJob | null; registeredId: string; name: string; projectLinked: boolean; onRestart: () => void }) {
  const status = job?.status;
  const finished = status === 'SUCCEEDED';
  const failed = status === 'FAILED' || status === 'CANCELLED';
  // Zarr registration answers with the id at once; a generation job gets it when the Backoffice registers the result.
  const datasetId = registeredId || registeredDatasetId(job);
  const registrationError = (job as Partial<JobSummary> | null)?.registration?.error;
  const t = useT();
  const statusText = status && JOB_STATUSES.includes(status) ? t(`jobStatus.${status}` as TKey) : status;
  return (
    <div className="page-stack wizard">
      <PageHeader title={t('wizard.title')} />
      <Card>
        <div className="wizard-result">
          <span className={`wizard-result__icon ${failed ? 'is-failed' : registeredId || finished ? '' : 'is-running'}`} aria-hidden>{registeredId || finished ? <CheckCircle2 size={28} /> : failed ? '!' : <Loader2 size={28} className="spin" />}</span>
          <h2 className="wizard-title">{t(registeredId ? 'wizard.result.registered' : finished ? 'wizard.result.finished' : failed ? 'wizard.result.failed' : 'wizard.result.started')}</h2>
          <p role="status">
            {registeredId ? t('wizard.result.registeredText', { name }) : <>{t('wizard.result.job', { name, id: String(job?.id) })}<strong>{statusText}</strong>{!finished && !failed ? t('wizard.result.keepsRunning') : ''}</>}
          </p>
          {finished && !datasetId && !registrationError && <p className="xc-hint" role="status">{t('wizard.result.registering')}</p>}
          {finished && registrationError && <Alert tone="warning">{t('wizard.result.registrationFailed', { error: registrationError })}</Alert>}
          {projectLinked && !registeredId && <p className="xc-hint">{t('wizard.result.projectLater')}</p>}
          <div className="wizard-result__actions">
            {datasetId ? <ButtonLink to={`/app/data/${encodeURIComponent(datasetId)}`}>{t('wizard.result.viewData')}</ButtonLink> : <ButtonLink to="/app/jobs">{t('app.inJobCenter')}</ButtonLink>}
            {datasetId && <a className="xc-btn xc-btn--line" href={viewerHref(datasetId)} target="_blank" rel="noopener noreferrer">{t('app.openInViewer')}<span className="sr-only">{t('wizard.result.newTab')}</span></a>}
            <Button variant="quiet" onClick={onRestart}>{t('wizard.result.again')}</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
