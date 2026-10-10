// S4 data add wizard. The steps depend on the method (UR-54):
// - GEE: 방식 → 자료 → 영역 → 기간·날짜 → 이름·확인 (one decision group per step; no inspection step, it adds nothing)
// - GeoTIFF/CAS500 and Shapefile: 방식 → 원본 입력 → 자동 검사 결과 → 설정 → 확인 및 생성 (the inspection is real)
// - Zarr registration: 방식 → 원본 입력 → 설정 → 확인 (nothing to inspect before registering)
// Requests are the same as before for the same choices (wizard.request.test.tsx).
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CloudDownload, Database, Droplets, FileArchive, Globe2, Image, Loader2, Search, UploadCloud } from 'lucide-react';
import { ChangeEvent, DragEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, userMessage } from '../../api/httpClient';
import { ColorBarOption, GeeCollection, GenerationJob, InspectionField, JobSummary, SpatialInspection } from '../../api/generationApi';
import { Alert, Button, ButtonLink, TextField } from '../../components/ui';
import { Badge, Card, PageHeader, RadioGroup, Skeleton } from '../../components/ui/kit';
import { appApi, canEditProject, generation, viewerHref } from '../api';
import { jobSteps } from '../jobs';
import { BBoxMap } from '../pages/DatasetDetailPage';
import AreaStep, { areaCenter, EstimatePanel } from './AreaStep';
import AreaMap from './AreaMap';
import DateTable from './DateTable';
import { AreaState, bboxBounds, emptyArea, resolveArea } from './areaModel';
import { useGeeEstimate } from './useGeeEstimate';
import { activeSelection, DateSelection, estimateDates, selectedDatesField, selectionProblem } from './dateModel';
import { suggestName } from './nameModel';
import { useLoad } from '../useLoad';
import VariableStyleEditor, { autoRange, defaultChoice, toVariableSpecs, validateChoices, VariableChoice } from './VariableStyleEditor';
import { FixedVariables, SarOptions } from './SarPairing';
import { defaultSar, FIXED_NAMES, PRESET_GEE, PRESET_STYLE, isS2, orbitOption, pairingActive, presetSar, S2_COLLECTION, sarError, sarRequest, SarState, WATER_BANDS, WATER_NAME, withPairingBlockers } from './sarModel';
import { withStrong } from './strong';
import './wizard.css';
import { failureText, formatNumber, registrationFailureText, serverText, useLanguage, useT } from '../../i18n';
import type { Lang, TFunction, TKey } from '../../i18n';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
// The wizard's text (UR-53 stage 3) loads with the wizard chunk only; it brings the management part along.
import '../../i18n/wizard';

type Method = 'geotiff' | 'shape' | 'gee' | 'zarr';
type RasterKind = 'geotiff' | 'cas500';
type GeeParams = { startDate: string; endDate: string; maxCloudPercent: string; scaleMeters: string };
type Rgb = { red: string; green: string; blue: string };

export type StepId = 'method' | 'source' | 'inspection' | 'settings' | 'confirm' | 'data' | 'area' | 'dates' | 'review';
const FILE_FLOW: StepId[] = ['method', 'source', 'inspection', 'settings', 'confirm'];
const GEE_FLOW: StepId[] = ['method', 'data', 'area', 'dates', 'review'];
const ZARR_FLOW: StepId[] = ['method', 'source', 'settings', 'confirm'];
/** The steps of a method; before one is chosen, the file flow's names stand in. */
export const stepsFor = (method: Method | null): StepId[] => (method === 'gee' ? GEE_FLOW : method === 'zarr' ? ZARR_FLOW : FILE_FLOW);

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
const RGB_CHANNELS = [['red', 'R'], ['green', 'G'], ['blue', 'B']] as const;

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
/** "red (B4)" when the variable was renamed, else the band name. */
const choiceLabel = (choice?: VariableChoice) => (!choice ? '' : choice.name && choice.name !== choice.source ? `${choice.name} (${choice.source})` : choice.source);

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

/** A field-level problem: the message shows next to `field`, and a failed 다음 moves focus there. */
type Problem = { field: string; message: string } | null;

/** Focus the first problem in `root`: a field marked `aria-invalid`, else the first control of a group marked `data-invalid`. */
export function focusFirstInvalid(root: HTMLElement | null) {
  // A field marked invalid itself comes first; else the first marked group.
  const target = root?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? root?.querySelector<HTMLElement>('[data-invalid="true"]');
  if (!target) return;
  // A choice group focuses its tab stop (radio), a form group its first field, anything else its first button.
  const control = target.matches('input, select, textarea, button')
    ? target
    : target.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')
      ?? target.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]):not([type="search"]), select:not([disabled]), textarea:not([disabled])')
      ?? target.querySelector<HTMLElement>('button:not([disabled]):not([tabindex="-1"])');
  if (control) { control.focus(); return; }
  target.tabIndex = -1;
  target.focus();
}

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
  // Folded summaries of the preset ("바꾸기" opens them).
  const [sarOpen, setSarOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [dateSel, setDateSel] = useState<DateSelection | null>(null);
  const [storageUri, setStorageUri] = useState('');
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
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
  // Counts failed 다음 presses, so focus moves to the first problem after each one.
  const [failedTries, setFailedTries] = useState(0);
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
  const bodyRef = useRef<HTMLDivElement>(null);
  const registrationPolls = useRef(0);
  const done = !!job || !!registeredId;
  const steps = stepsFor(method);
  const current = steps[step];
  const last = step === steps.length - 1;
  const isGee = method === 'gee';

  // Leaving the tab mid-way loses the inputs; ask first.
  useEffect(() => {
    if (step === 0 || done) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [step, done]);
  useEffect(() => { headingRef.current?.focus(); }, [step]);
  useEffect(() => { if (failedTries) focusFirstInvalid(bodyRef.current); }, [failedTries]);

  // Poll the generation job until it finishes and, when it succeeded, until the new dataset is registered.
  useEffect(() => {
    if (!job) return;
    const awaitingRegistration = job.status === 'SUCCEEDED' && !registeredDatasetId(job)
      && !(job as Partial<JobSummary>).registration?.error && !(job as Partial<JobSummary>).registration?.errorCode && registrationPolls.current < REGISTRATION_POLLS;
    if (TERMINAL.includes(job.status) && !awaitingRegistration) return;
    if (awaitingRegistration) registrationPolls.current += 1;
    const timer = window.setTimeout(() => {
      generation.getJob(job.id).then(setJob).catch(() => undefined);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [job]);

  const collection = collections.data?.find((item) => item.id === collectionId);
  const fields: InspectionField[] = useMemo(() => {
    if (isGee) return (collection?.bands ?? []).map((band) => ({ name: typeof band === 'string' ? band : band.id ?? band.name }));
    return fieldsOf(inspection);
  }, [isGee, collection, inspection]);
  const resolved = useMemo(() => resolveArea(area, lang), [area, lang]);
  const datesOk = !!gee.startDate && !!gee.endDate && gee.startDate <= gee.endDate;
  const pairing = isGee && pairingActive(collectionId, sar);
  const sarFields = isGee ? sarRequest(collectionId, sar) : {};
  const estimateBands = choices.length ? choices.map((item) => item.source) : fields.map((field) => field.name);
  // The estimate starts on "기간·날짜", once collection, area and period are known.
  const estimateBody = isGee && step >= GEE_FLOW.indexOf('dates') && collectionId && datesOk && resolved.request && resolved.bbox
    ? { name: ESTIMATE_NAME, collectionId, bands: estimateBands, startDate: gee.startDate, endDate: gee.endDate, maxCloudPercent: Number(gee.maxCloudPercent), scaleMeters: Number(gee.scaleMeters), bounds: bboxBounds(resolved.bbox), area: resolved.request, bandStyles: [], ...sarFields }
    : null;
  const estimate = useGeeEstimate(estimateBody);
  const ready = estimate.status === 'ok';
  const blockers = isGee && ready ? withPairingBlockers(estimate.data, pairing) : [];
  // Date picking (UR-43): the picks belong to one area/period; changing either (a new date list) starts again from all dates.
  // Bands and what to do with unpaired dates do not change the list, so changing them keeps the picks.
  const { dropUnpaired, ...pairScope } = sarFields.sarPairing ?? { dropUnpaired: true };
  const dateScope = JSON.stringify([collectionId, gee.startDate, gee.endDate, gee.maxCloudPercent, resolved.request ?? null, pairScope]);
  useEffect(() => { setDateSel(null); }, [dateScope]);
  const estimateDateList = isGee ? estimateDates(estimate.data) : null;
  const dateSelection = isGee ? activeSelection(dateSel, dateScope, estimateDateList) : null;
  const dateProblem = ready ? selectionProblem(dateSelection, estimateDateList, pairing ? { keepUnpaired: sar.keepUnpaired } : null, lang) : '';
  const pickDates = (picked: string[]) => { if (estimateDateList) setDateSel({ scope: dateScope, all: estimateDateList.map((item) => item.date), picked }); };
  // Dates and blockers come from the estimate, so a GEE request cannot go on before the estimate for these inputs is in.
  const estimateStep = isGee && (current === 'dates' || current === 'review') && datesOk;
  const estimateWait = !estimateStep || ready ? '' : estimate.status === 'error' ? t('wizard.estimate.waitFailed') : estimate.status === 'loading' ? t('wizard.estimate.waiting') : t('wizard.estimate.notYet');
  const noun = method === 'shape' ? 'attribute' : 'band';
  const continuous = choices.filter((choice) => choice.kind === 'continuous');
  const rgbPossible = (isGee || method === 'geotiff') && continuous.length >= 3;
  const variableErrors = validateChoices(choices, colorBars.data ?? [], lang);
  const editableProjects = (projects.data ?? []).filter(canEditProject);
  // CAS500 and Shapefile get sensor/mode defaults on the server; a generic GeoTIFF needs them from the user.
  const genericRaster = method === 'geotiff' && rasterKind === 'geotiff';
  const sensorValue = sensor === 'custom' ? customSensor.trim() : sensor;
  const fileInputs = method === 'geotiff' || method === 'shape';
  const dateRequired = fileInputs && !(method === 'geotiff' && rasterKind === 'cas500') && !!inspection && !hasTimeInName(inspection.fileName, method!);
  const suggestedName = isGee ? suggestName(area, gee.startDate, gee.endDate) : '';
  const channels: Record<string, 'R' | 'G' | 'B'> = rgbOn && rgbPossible ? Object.fromEntries(RGB_CHANNELS.filter(([key]) => rgb[key]).map(([key, letter]) => [rgb[key], letter])) : {};

  // The GEE name is filled in from the place and period until the user types their own (UR-54).
  useEffect(() => { if (current === 'review' && !nameEdited && suggestedName) setName(suggestedName); }, [current, nameEdited, suggestedName]);

  const chooseMethod = (next: Method) => {
    if (next !== method) {
      setInspection(null); setInspectFailure(null); setChoices([]); setCollectionId(''); setRgbOn(false); setName(''); setNameEdited(false); setSar(defaultSar()); setPreset(false);
    }
    setMethod(next);
  };
  const inspectFile = async (file: File) => {
    if (!method || isGee || method === 'zarr') return;
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
    const colorBar = bars.some((item) => item.id === PRESET_STYLE.colorBar) ? PRESET_STYLE.colorBar : undefined;
    setPreset(true); setSarOpen(false); setDisplayOpen(false);
    setCollectionId(S2_COLLECTION); setSar(presetSar()); setGee((value) => ({ ...value, ...PRESET_GEE }));
    setChoices(WATER_BANDS.map((band) => {
      const base = defaultChoice({ name: band.source }, bars);
      return { ...base, name: band.name, min: PRESET_STYLE.min, max: PRESET_STYLE.max, colorBar: colorBar ?? base.colorBar, origin: 'preset' as const };
    }));
    setRgbOn(true); setRgb({ red: 'B4', green: 'B3', blue: 'B2' });
  };
  const changeSar = (nextSar: SarState) => {
    if (nextSar.enabled !== sar.enabled) setChoices((value) => renameForPairing(value, nextSar.enabled));
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

  /** Settings checks shared by the file/Zarr "설정" step and the GEE review. */
  const settingsProblem = (): Problem => {
    const say = (field: string, key: TKey, vars?: Record<string, string | number>): Problem => ({ field, message: t(key, vars) });
    if (!name.trim()) return say('name', 'wizard.settings.nameRequired');
    if (!choices.length) return say('bands', noun === 'attribute' ? 'wizard.settings.pickAttributes' : 'wizard.settings.pickBands');
    if (Object.keys(variableErrors).length) return say('style', 'wizard.settings.checkStyle');
    if (pairing && choices.some((choice) => (FIXED_NAMES as readonly string[]).includes(choice.name.trim()))) return say('style', 'wizard.settings.fixedNames', { names: FIXED_NAMES.join('·') });
    if (method === 'shape' && !(Number(resolution) > 0)) return say('resolution', 'wizard.settings.resolutionCheck');
    if (genericRaster && !sensorValue) return say('sensor', 'wizard.settings.sensorRequired');
    if (dateRequired && !obsDate) return say('obsDate', 'wizard.settings.obsDateMissing');
    if (nodata !== '' && !Number.isFinite(Number(nodata))) return say('nodata', 'wizard.settings.nodataNumber');
    if (rgbOn && rgbPossible && !(rgb.red && rgb.green && rgb.blue)) return say('rgb', 'wizard.rgb.required');
    if (method !== 'zarr' && !colorBars.data?.length) return say('style', 'wizard.settings.colorBarsMissing');
    return null;
  };
  /** What the user has to fix on a step before 다음 (field problems; waiting states are `blockReason`). */
  const problemOf = (id: StepId): Problem => {
    switch (id) {
      case 'method': return method ? null : { field: 'method', message: t('wizard.method.required') };
      case 'source':
        if (method === 'zarr') return storageUri.trim() ? null : { field: 'zarr', message: t('wizard.zarr.required') };
        return inspection ? null : { field: 'file', message: t(inspecting ? 'wizard.file.busy' : 'wizard.file.required') };
      case 'data':
        if (!collectionId) return { field: 'catalog', message: t('wizard.catalog.required') };
        if (!preset && !choices.length) return { field: 'bands', message: t('wizard.settings.pickBands') };
        if (pairing && sarError(sar, lang)) return { field: 'sar', message: sarError(sar, lang) };
        return null;
      case 'area': return resolved.error ? { field: 'area', message: resolved.error } : null;
      case 'dates':
        if (!gee.startDate || !gee.endDate) return { field: 'period', message: t('wizard.gee.periodRequired') };
        if (gee.startDate > gee.endDate) return { field: 'period', message: t('wizard.gee.periodOrder') };
        return null;
      case 'settings': case 'review': return settingsProblem();
      default: return null;
    }
  };
  /** Why 다음 / 생성 시작 cannot be pressed now (shown next to it); '' when it can. */
  const blockReason = (): string => {
    if (current === 'source' && inspecting) return t('wizard.file.busy');
    if (isGee && (current === 'dates' || current === 'review') && datesOk) {
      if (estimateWait) return estimateWait;
      // The blocker itself is spelled out in the estimate panel; the footer points to it.
      if (blockers.length) return t('wizard.nav.blocked');
      if (dateProblem) return dateProblem;
    }
    return '';
  };
  const failStep = () => { setShowErrors(true); setFailedTries((value) => value + 1); };
  const next = () => {
    if (problemOf(current)) { failStep(); return; }
    setShowErrors(false);
    setStep((value) => Math.min(steps.length - 1, value + 1));
  };
  const back = () => { setShowErrors(false); setStep((value) => Math.max(0, value - 1)); };

  const submit = async () => {
    if (problemOf(current)) { failStep(); return; }
    setSubmitting(true); setSubmitFailure(null);
    const specs = toVariableSpecs(choices);
    const channel = (source: string) => {
      const choice = choices.find((item) => item.source === source)!;
      return { variable: source, valueMin: Number(choice.min), valueMax: Number(choice.max) };
    };
    const rgbStyle = rgbOn && rgbPossible ? { red: channel(rgb.red), green: channel(rgb.green), blue: channel(rgb.blue) } : undefined;
    try {
      if (isGee) {
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
      setSubmitFailure({ cause, noFileJobs: cause instanceof ApiError && cause.status === 404 && !isGee && method !== 'zarr' });
    } finally {
      setSubmitting(false);
    }
  };
  const retryJob = async () => {
    if (!job) return;
    registrationPolls.current = 0;
    setJob(await generation.retryJob(String(job.id)));
  };

  if (done) return <Result job={job} registeredId={registeredId} name={name} projectLinked={!!projectId && method !== 'zarr'} onRestart={onRestart} onRetry={retryJob} />;
  const problem = showErrors ? problemOf(current) : null;
  const errorFor = (field: string) => (problem?.field === field ? problem.message : '');
  const invalid = (field: string) => (problem?.field === field ? true : undefined);
  const groupError = (field: string) => (errorFor(field) ? <p className="xc-field__error" id={`wizard-error-${field}`}>{errorFor(field)}</p> : null);
  const reason = blockReason();
  const stepLabel = (id: StepId) => t(`wizard.steps.${id}` as TKey);

  // Name and project: the file/Zarr "설정" step and the GEE review share them.
  const nameAndProject = (
    <div className="form-grid">
      <TextField
        label={t('wizard.settings.name')} value={name} maxLength={150} placeholder={t('wizard.settings.namePlaceholder')}
        onChange={(event) => { setName(event.target.value); setNameEdited(true); }}
        help={isGee && !nameEdited && name && name === suggestedName ? t('wizard.settings.nameSuggested') : undefined}
        error={errorFor('name') || (showErrors && !name.trim() ? t('wizard.settings.nameRequired') : undefined)}
      />
      <label className="xc-field">
        <span className="xc-label">{t('wizard.settings.project')} <span className="xc-hint">{t('wizard.settings.optional')}</span></span>
        <select className="xc-select" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          <option value="">{t('app.noProject')}</option>
          {editableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </label>
    </div>
  );
  const variableEditor = (show: 'all' | 'style') => (
    <div className="wizard-group" data-invalid={invalid('style') || invalid('bands')}>
      {groupError('bands')}
      {groupError('style')}
      <VariableStyleEditor
        fields={method === 'zarr' ? [] : fields}
        value={choices}
        onChange={changeChoices}
        colorBars={colorBars.data ?? []}
        noun={noun}
        allowCustom={method === 'zarr'}
        renamable={!isGee || pairing}
        continuousOnly={isGee}
        errors={showErrors ? variableErrors : {}}
        show={show}
        channels={channels}
      />
    </div>
  );
  const rgbSection = rgbPossible && (
    <section className="wizard-rule rgb-box" data-invalid={invalid('rgb')}>
      <label className="xc-check"><input type="checkbox" checked={rgbOn} onChange={(event) => setRgbOn(event.target.checked)} /><span><strong>{t('wizard.rgb.toggle')}</strong> <span className="xc-hint">{t('wizard.rgb.hint')}</span></span></label>
      {rgbOn && (
        <div className="form-grid">
          {RGB_CHANNELS.map(([channel]) => (
            <label className="xc-field" key={channel}>
              <span className="xc-label">{t(`wizard.rgb.${channel}`)}</span>
              <select className="xc-select" value={rgb[channel]} aria-invalid={invalid('rgb') && !rgb[channel] ? true : undefined} onChange={(event) => setRgb({ ...rgb, [channel]: event.target.value })}>
                <option value="">{t('wizard.rgb.pick')}</option>
                {continuous.map((choice) => <option key={choice.source} value={choice.source}>{choiceLabel(choice)}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
      {groupError('rgb')}
    </section>
  );
  const rgbText = `R ${choiceLabel(choices.find((item) => item.source === rgb.red))} · G ${choiceLabel(choices.find((item) => item.source === rgb.green))} · B ${choiceLabel(choices.find((item) => item.source === rgb.blue))}`;
  const variablesSummary = (
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
  );
  const displayShown = !preset || displayOpen || !!(showErrors && problem && ['style', 'rgb', 'bands'].includes(problem.field));
  const filteredCollections = (collections.data ?? []).filter((item) => [item.id, item.name, item.title].some((text) => text?.toLowerCase().includes(catalogQuery.trim().toLowerCase())));
  const presetAvailable = (collections.data ?? []).some((item) => item.id === S2_COLLECTION);

  return (
    <div className="page-stack wizard">
      <PageHeader back={<Link className="page-back" to="/app/data"><ArrowLeft size={16} aria-hidden />{t('wizard.back')}</Link>} title={t('wizard.title')} description={t('wizard.description')} />
      <ol className="wizard-steps" aria-label={t('wizard.steps.label')}>
        {steps.map((id, index) => (
          <li key={id} className={index === step ? 'is-current' : index < step ? 'is-done' : ''} aria-current={index === step ? 'step' : undefined}>
            <span className="wizard-steps__dot">{index < step ? <Check size={14} aria-hidden /> : index + 1}</span>
            <span className="wizard-steps__label">{stepLabel(id)}</span>
          </li>
        ))}
      </ol>

      <Card className="wizard-card">
        <div className="wizard-body" ref={bodyRef}>
          <h2 className="wizard-title" ref={headingRef} tabIndex={-1}>{stepLabel(current)}</h2>

          {current === 'method' && (
            <div className="wizard-group" data-invalid={invalid('method')}>
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
              {groupError('method')}
            </div>
          )}

          {current === 'source' && fileInputs && (
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
              <div className="wizard-group" data-invalid={invalid('file')}>
                <FileDrop
                  accept={method === 'shape' || rasterKind === 'cas500' ? '.zip,application/zip' : '.tif,.tiff,image/tiff'}
                  title={t(method === 'shape' ? 'wizard.file.dropShape' : rasterKind === 'cas500' ? 'wizard.file.dropCas500' : 'wizard.file.dropGeotiff')}
                  hint={t(method === 'shape' ? 'wizard.file.hintShape' : rasterKind === 'cas500' ? 'wizard.file.hintCas500' : 'wizard.file.hintGeotiff')}
                  busy={inspecting}
                  fileName={inspection?.fileName}
                  onFile={inspectFile}
                />
                {groupError('file')}
              </div>
              {inspectError && <Alert tone="danger">{t('wizard.file.inspectFailed', { error: inspectError })}</Alert>}
              {inspection && <Alert tone="success">{serverText({ code: inspection.messageCode, params: inspection.messageParams, message: inspection.message }, lang)}</Alert>}
            </div>
          )}

          {current === 'source' && method === 'zarr' && (
            <div className="wizard-section">
              <TextField label={t('wizard.zarr.uri')} placeholder={t('wizard.zarr.placeholder')} value={storageUri} onChange={(event) => setStorageUri(event.target.value)} help={t('wizard.zarr.help')} error={errorFor('zarr') || undefined} />
            </div>
          )}

          {current === 'data' && (
            <div className="wizard-section">
              {collections.loading ? <Skeleton lines={3} label={t('wizard.catalog.loading')} /> : collections.error ? (
                <Alert tone="danger">{t('wizard.catalog.failed', { error: collections.error })}</Alert>
              ) : (
                <div className="wizard-group catalog" data-invalid={invalid('catalog')}>
                  {presetAvailable && (
                    <RadioGroup className="catalog__preset" label={t('wizard.catalog.presetGroup')}>
                      <button type="button" role="radio" aria-checked={preset} className={`catalog__item catalog__item--preset ${preset ? 'is-on' : ''}`} onClick={choosePreset}>
                        <span className="xc-cell-main">
                          <strong>{t('wizard.catalog.presetTitle')}</strong>
                          <small>{t('wizard.catalog.presetText')}</small>
                          <small className="tabular">{t('wizard.catalog.presetFixed', { bands: WATER_BANDS.length, cloud: PRESET_GEE.maxCloudPercent, scale: PRESET_GEE.scaleMeters })}</small>
                        </span>
                        <Badge><Droplets size={12} aria-hidden /> {t('wizard.catalog.preset')}</Badge>
                      </button>
                    </RadioGroup>
                  )}
                  <div className="catalog__custom">
                    <h3 className="wizard-rule__title" id="catalog-custom">{t('wizard.catalog.custom')}</h3>
                    <p className="xc-hint">{t('wizard.catalog.hint')}</p>
                    <label className="toolbar__search catalog__search">
                      <Search size={16} aria-hidden />
                      <input type="search" value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder={t('wizard.catalog.searchPlaceholder')} aria-label={t('wizard.catalog.searchLabel')} />
                    </label>
                    <RadioGroup className="catalog__list" label={t('wizard.catalog.label')}>
                      {filteredCollections.map((item) => (
                        <button key={item.id} type="button" role="radio" aria-checked={!preset && collectionId === item.id} className={`catalog__item ${!preset && collectionId === item.id ? 'is-on' : ''}`} onClick={() => chooseCollection(item.id)}>
                          <span className="xc-cell-main"><strong>{item.title || item.name || item.id}</strong><small>{item.id}</small></span>
                          <Badge>{t('wizard.catalog.bandCount', { count: item.bands.length })}</Badge>
                        </button>
                      ))}
                    </RadioGroup>
                  </div>
                  {groupError('catalog')}
                </div>
              )}
              {isS2(collectionId) && (preset && !sarOpen ? (
                <section className="wizard-rule" aria-labelledby="sar-summary-title">
                  <div className="wizard-rule__head">
                    <h3 className="wizard-rule__title" id="sar-summary-title">{t('wizard.sar.title')}</h3>
                    <Button variant="line" size="sm" aria-expanded={false} aria-label={t('wizard.changeNamed', { what: t('wizard.sar.title') })} onClick={() => setSarOpen(true)}>{t('wizard.change')}</Button>
                  </div>
                  <p className="wizard-rule__text">{sarSummary(sar, t, lang)}</p>
                </section>
              ) : (
                <div className="wizard-group" data-invalid={invalid('sar')}>
                  <SarOptions sar={sar} onChange={changeSar} showErrors={showErrors} />
                </div>
              ))}
              {collectionId && !preset && (
                <section className="wizard-rule" data-invalid={invalid('bands')}>
                  <VariableStyleEditor fields={fields} value={choices} onChange={changeChoices} colorBars={colorBars.data ?? []} noun="band" renamable={pairing} continuousOnly show="pick" />
                  {groupError('bands')}
                </section>
              )}
            </div>
          )}

          {current === 'area' && <AreaStep area={area} onChange={setArea} resolved={resolved} showErrors={showErrors} />}

          {current === 'dates' && (
            <div className="wizard-section">
              <div className="form-grid wizard-period">
                <TextField label={t('wizard.gee.startDate')} type="date" value={gee.startDate} onChange={(event) => setGee({ ...gee, startDate: event.target.value })} error={errorFor('period') && (!gee.startDate || (!!gee.endDate && gee.startDate > gee.endDate)) ? errorFor('period') : undefined} />
                <TextField label={t('wizard.gee.endDate')} type="date" value={gee.endDate} onChange={(event) => setGee({ ...gee, endDate: event.target.value })} error={errorFor('period') && !gee.endDate && !!gee.startDate ? errorFor('period') : undefined} />
              </div>
              <details className="wizard-more">
                <summary>{t('wizard.gee.advanced')} <span className="xc-hint tabular">· {t('wizard.gee.advancedValue', { cloud: gee.maxCloudPercent, scale: gee.scaleMeters })}</span></summary>
                <div className="form-grid">
                  <TextField label={t('wizard.gee.maxCloud')} type="number" min={0} max={100} value={gee.maxCloudPercent} onChange={(event) => setGee({ ...gee, maxCloudPercent: event.target.value })} help={preset && gee.maxCloudPercent === PRESET_GEE.maxCloudPercent ? t('wizard.gee.presetValue') : undefined} />
                  <TextField label={t('wizard.gee.pixelSize')} type="number" min={10} max={10000} value={gee.scaleMeters} onChange={(event) => setGee({ ...gee, scaleMeters: event.target.value })} help={preset && gee.scaleMeters === PRESET_GEE.scaleMeters ? t('wizard.gee.presetValue') : undefined} />
                </div>
              </details>
              <EstimatePanel estimate={estimate} hint={!datesOk ? t('wizard.gee.periodRequired') : undefined} pairing={pairing ? { keepUnpaired: sar.keepUnpaired } : undefined} picked={dateSelection?.picked} />
              {estimate.data && dateSelection && estimateDates(estimate.data) && (
                <DateTable data={estimate.data} picked={dateSelection.picked} onChange={pickDates} pairing={pairing ? { keepUnpaired: sar.keepUnpaired } : undefined} stale={estimate.stale} />
              )}
            </div>
          )}

          {current === 'settings' && (
            <div className="wizard-section">
              {nameAndProject}
              <div className="form-grid">
                {method === 'shape' && <TextField label={t('wizard.settings.resolution')} type="number" step="0.000001" min={0.000001} value={resolution} onChange={(event) => setResolution(event.target.value)} help={t('wizard.settings.resolutionHelp')} error={errorFor('resolution') || undefined} />}
                {genericRaster && (
                  <div className="xc-field">
                    <label className="xc-label" htmlFor="wizard-sensor">{t('wizard.settings.sensor')}</label>
                    <select id="wizard-sensor" className="xc-select" value={sensor} onChange={(event) => setSensor(event.target.value)} aria-invalid={invalid('sensor')} aria-describedby={errorFor('sensor') ? 'wizard-error-sensor' : 'wizard-sensor-hint'}>
                      <option value="">{t('wizard.settings.choose')}</option>
                      {SENSORS.map((item) => <option key={item.id} value={item.id}>{sensorLabel(item, t)}</option>)}
                      <option value="custom">{t('wizard.settings.sensorOther')}</option>
                    </select>
                    {errorFor('sensor') ? groupError('sensor') : <span className="xc-hint" id="wizard-sensor-hint">{t('wizard.settings.sensorHint')}</span>}
                  </div>
                )}
                {genericRaster && sensor === 'custom' && <TextField label={t('wizard.settings.sensorName')} placeholder={t('wizard.settings.sensorNamePlaceholder')} value={customSensor} maxLength={64} onChange={(event) => setCustomSensor(event.target.value.toUpperCase())} error={showErrors && !customSensor.trim() ? t('wizard.settings.sensorNameRequired') : undefined} />}
                {fileInputs && !(method === 'geotiff' && rasterKind === 'cas500') && (
                  <TextField
                    label={t(dateRequired ? 'wizard.settings.obsDate' : 'wizard.settings.obsDateOptional')}
                    type="date"
                    value={obsDate}
                    onChange={(event) => setObsDate(event.target.value)}
                    help={dateRequired ? t('wizard.settings.obsDateNeeded', { pattern: method === 'shape' ? 'YYYYMM' : 'YYYYMMDDHHMMSS' }) : t('wizard.settings.obsDateHelp')}
                    error={errorFor('obsDate') || (showErrors && dateRequired && !obsDate ? t('wizard.settings.obsDateRequired') : undefined)}
                  />
                )}
                {fileInputs && <TextField label={t('wizard.settings.nodata')} type="number" step="any" value={nodata} onChange={(event) => setNodata(event.target.value)} help={t('wizard.settings.nodataHelp')} error={errorFor('nodata') || undefined} />}
              </div>
              {colorBars.error && method !== 'zarr' && <Alert tone="danger">{t('wizard.settings.colorBarsFailed', { error: colorBars.error })}</Alert>}
              {variableEditor('all')}
              {rgbSection}
            </div>
          )}

          {current === 'review' && (
            <div className="wizard-section">
              {nameAndProject}
              <section className="wizard-rule" aria-labelledby="display-title">
                <div className="wizard-rule__head">
                  <h3 className="wizard-rule__title" id="display-title">{t('wizard.display.title')}</h3>
                  {preset && (
                    <Button variant="line" size="sm" aria-expanded={displayShown} aria-controls="display-body" aria-label={displayShown ? undefined : t('wizard.changeNamed', { what: t('wizard.display.what') })} onClick={() => setDisplayOpen(!displayShown)}>
                      {t(displayShown ? 'wizard.fold' : 'wizard.change')}
                    </Button>
                  )}
                </div>
                {preset && !displayShown ? (
                  <div id="display-body">
                    <p className="wizard-rule__text">{t('wizard.display.presetSummary', { bands: choices.length, reference: sar.waterReference ? 1 : 0 })}</p>
                    <p className="xc-hint">{t('wizard.display.presetHint')}</p>
                  </div>
                ) : (
                  <div id="display-body" className="wizard-section">
                    {colorBars.error && <Alert tone="danger">{t('wizard.settings.colorBarsFailed', { error: colorBars.error })}</Alert>}
                    {variableEditor(preset ? 'all' : 'style')}
                    {pairing && <FixedVariables waterReference={sar.waterReference} />}
                    {rgbSection}
                  </div>
                )}
              </section>
              <div className="review-grid">
                <div className="review-grid__map">
                  <AreaMap readOnly bbox={resolved.bbox} geojson={area.tab === 'admin' || area.tab === 'shape' ? resolved.geojson : undefined} center={areaCenter(area, resolved)} pick={null} />
                </div>
                <dl className="meta-list summary-list">
                  <dt>{t('wizard.summary.collection')}</dt>
                  <dd>{preset ? t('wizard.catalog.presetTitle') : collection?.title || collection?.name || collectionId}{!preset && collection && <><br /><span className="xc-hint">{collection.id}</span></>}</dd>
                  <dt>{t('wizard.inspect.period')}</dt><dd className="tabular">{t('wizard.summary.period', { start: gee.startDate, end: gee.endDate })}</dd>
                  {dateSelection && (
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
                  <dt>{t('wizard.summary.area')}</dt><dd>{resolved.modeLabel} · {resolved.label}</dd>
                  <dt>{t('wizard.summary.clip')}</dt><dd data-testid="summary-clip">{resolved.clipLabel}{resolved.request?.maskVariable ? ` · ${t('wizard.summary.maskSaved')}` : ''}</dd>
                  <dt>{t('wizard.summary.pixel')}</dt><dd className="tabular">{t('wizard.gee.advancedValue', { cloud: gee.maxCloudPercent, scale: gee.scaleMeters })}</dd>
                  {pairing && <><dt>{t('wizard.summary.radarPair')}</dt><dd>{sarSummary(sar, t, lang)}</dd></>}
                  <dt>{t('wizard.summary.variables')}</dt><dd>{variablesSummary}</dd>
                  {rgbOn && rgbPossible && <><dt>RGB</dt><dd>{rgbText}</dd></>}
                </dl>
              </div>
              <EstimatePanel estimate={estimate} compact pairing={pairing ? { keepUnpaired: sar.keepUnpaired } : undefined} picked={dateSelection?.picked} />
              {submitError && <Alert tone="danger">{submitError}</Alert>}
            </div>
          )}

          {current === 'inspection' && <InspectionSummary method={method!} rasterKind={rasterKind} inspection={inspection} fields={fields} />}

          {current === 'confirm' && (
            <div className="wizard-section">
              <dl className="meta-list summary-list">
                <dt>{t('wizard.summary.method')}</dt><dd>{methodTitle(METHODS.find((item) => item.id === method)!, t)}{method === 'geotiff' ? ` · ${rasterKind === 'cas500' ? 'CAS500' : t('wizard.file.geotiff')}` : ''}</dd>
                <dt>{t('wizard.summary.source')}</dt><dd>{method === 'zarr' ? storageUri : inspection?.fileName}</dd>
                <dt>{t('wizard.summary.name')}</dt><dd>{name}</dd>
                <dt>{t('wizard.summary.project')}</dt><dd>{editableProjects.find((item) => item.id === projectId)?.name ?? t('app.noProject')}</dd>
                <dt>{t('wizard.summary.variables')}</dt><dd>{variablesSummary}</dd>
                {rgbOn && rgbPossible && <><dt>RGB</dt><dd>{rgbText}</dd></>}
                {method === 'shape' && <><dt>{t('wizard.summary.resolution')}</dt><dd>{resolution}°</dd></>}
                {genericRaster && <><dt>{t('wizard.summary.sensor')}</dt><dd>{(() => { const known = SENSORS.find((item) => item.id === sensorValue); return known ? sensorLabel(known, t) : sensorValue; })()}</dd></>}
                {obsDate && <><dt>{t('wizard.summary.obsDate')}</dt><dd>{obsDate}</dd></>}
                {nodata !== '' && <><dt>nodata</dt><dd>{nodata}</dd></>}
              </dl>
              {method === 'zarr' && <Alert>{withStrong(t, 'wizard.inspect.zarrNote', 'path', storageUri)}</Alert>}
              {submitError && <Alert tone="danger">{submitError}</Alert>}
            </div>
          )}
        </div>
        {/* Sticky on every step: the next action never scrolls out of reach; a disabled one says why. */}
        <div className="wizard-foot">
          <Button variant="secondary" onClick={back} disabled={step === 0 || submitting}><ArrowLeft size={16} aria-hidden />{t('wizard.nav.prev')}</Button>
          <span className="xc-hint wizard-foot__count">{step + 1} / {steps.length}</span>
          {reason && (
            <span className="xc-hint wizard-foot__wait" role="status" id="wizard-next-reason">
              {(estimate.status === 'loading' && !!estimateWait) || (current === 'source' && inspecting) ? <Loader2 size={14} className="spin" aria-hidden /> : null}
              <span className="sr-only">{t('wizard.nav.reasonLabel')}: </span>{reason}
              {estimateWait && estimate.retry && <Button variant="line" size="sm" onClick={estimate.retry}>{t('wizard.estimate.recalculate')}</Button>}
            </span>
          )}
          {!last ? (
            <Button onClick={next} disabled={!!reason} aria-describedby={reason ? 'wizard-next-reason' : undefined}>{t('wizard.nav.next')}<ArrowRight size={16} aria-hidden /></Button>
          ) : (
            <Button onClick={submit} disabled={submitting || !!reason} aria-describedby={reason ? 'wizard-next-reason' : undefined}>{submitting ? <><Loader2 size={16} className="spin" aria-hidden />{t('wizard.nav.submitting')}</> : t(method === 'zarr' ? 'wizard.nav.register' : 'wizard.nav.create')}</Button>
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

/** "자동 검사 결과" of a GeoTIFF/CAS500 or Shapefile upload (GEE and Zarr have no inspection step). */
function InspectionSummary({ method, rasterKind, inspection, fields }: { method: Method; rasterKind: RasterKind; inspection: SpatialInspection | null; fields: InspectionField[] }) {
  const { lang, t } = useLanguage();
  if (!inspection) return <Alert tone="warning">{t('wizard.inspect.missing')}</Alert>;
  const bounds = inspection.bounds;
  const lower = inspection.files.map((file) => file.toLowerCase());
  return (
    <div className="wizard-section">
      <div className="inspect-grid">
        {bounds ? <BBoxMap bbox={[bounds.west, bounds.south, bounds.east, bounds.north]} /> : <div className="xc-hint inspect-grid__empty">{t('wizard.inspect.noBounds')}</div>}
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

/** The page after 생성 시작 / 등록: focus on its heading, progress while running, the reason and 다시 시도 on failure. */
function Result({ job, registeredId, name, projectLinked, onRestart, onRetry }: { job: GenerationJob | null; registeredId: string; name: string; projectLinked: boolean; onRestart: () => void; onRetry: () => Promise<void> }) {
  const status = job?.status;
  const finished = status === 'SUCCEEDED';
  const failed = status === 'FAILED' || status === 'CANCELLED';
  // Zarr registration answers with the id at once; a generation job gets it when the Backoffice registers the result.
  const datasetId = registeredId || registeredDatasetId(job);
  const { lang, t } = useLanguage();
  const summary = job as Partial<JobSummary> | null;
  const registrationError = registrationFailureText(summary?.registration, lang);
  const statusText = status && JOB_STATUSES.includes(status) ? t(`jobStatus.${status}` as TKey) : status;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryFailure, setRetryFailure] = useState<{ cause: unknown } | null>(null);
  useEffect(() => { headingRef.current?.focus(); }, [failed, finished]);
  const percent = typeof summary?.progress === 'number' ? Math.round(Math.max(0, Math.min(1, summary.progress)) * 100) : null;
  const stage = summary ? jobSteps({ type: 'GEE_TO_ZARR', ...summary } as JobSummary, lang).find((item) => item.state === 'current')?.label : undefined;
  const reasonText = job && status === 'FAILED' ? failureText({ errorCode: summary?.errorCode, errorParams: summary?.errorParams, errorMessage: summary?.errorMessage }, lang) || t('wizard.result.unknownReason') : '';
  const retry = async () => {
    setRetrying(true); setRetryFailure(null);
    try { await onRetry(); } catch (cause) { setRetryFailure({ cause }); } finally { setRetrying(false); }
  };
  return (
    <div className="page-stack wizard">
      <PageHeader title={t('wizard.title')} />
      <Card>
        <div className="wizard-result">
          <span className={`wizard-result__icon ${failed ? 'is-failed' : registeredId || finished ? '' : 'is-running'}`} aria-hidden>{registeredId || finished ? <CheckCircle2 size={28} /> : failed ? '!' : <Loader2 size={28} className="spin" />}</span>
          <h2 className="wizard-title" ref={headingRef} tabIndex={-1}>{t(registeredId ? 'wizard.result.registered' : finished ? 'wizard.result.finished' : failed ? 'wizard.result.failed' : 'wizard.result.started')}</h2>
          <p role="status">
            {registeredId ? t('wizard.result.registeredText', { name }) : <>{t('wizard.result.job', { name, id: String(job?.id) })}<strong>{statusText}</strong>{!finished && !failed ? t('wizard.result.keepsRunning') : ''}</>}
          </p>
          {status === 'RUNNING' && percent != null && (
            <div className="wizard-result__progress">
              <progress className="wizard-progress" max={100} value={percent} aria-label={t('wizard.result.progress')} />
              <span className="xc-hint tabular">{stage ? t('wizard.result.progressValue', { percent, stage }) : `${percent}%`}</span>
            </div>
          )}
          {reasonText && <Alert tone="danger">{t('wizard.result.failReason', { reason: reasonText })}</Alert>}
          {retryFailure && <Alert tone="danger">{t('wizard.result.retryFailed', { error: userMessage(retryFailure.cause, lang) })}</Alert>}
          {finished && !datasetId && !registrationError && <p className="xc-hint" role="status">{t('wizard.result.registering')}</p>}
          {finished && registrationError && <Alert tone="warning">{t('wizard.result.registrationFailed', { error: registrationError })}</Alert>}
          {projectLinked && !registeredId && <p className="xc-hint">{t('wizard.result.projectLater')}</p>}
          <div className="wizard-result__actions">
            {failed && job && <Button onClick={retry} disabled={retrying}>{retrying ? <><Loader2 size={16} className="spin" aria-hidden />{t('wizard.result.retrying')}</> : t('wizard.result.retry')}</Button>}
            {datasetId ? <ButtonLink to={`/app/data/${encodeURIComponent(datasetId)}`}>{t('wizard.result.viewData')}</ButtonLink> : <ButtonLink variant={failed ? 'line' : 'ink'} to="/app/jobs">{t('app.inJobCenter')}</ButtonLink>}
            {datasetId && <a className="xc-btn xc-btn--line" href={viewerHref(datasetId)} target="_blank" rel="noopener noreferrer">{t('app.openInViewer')}<span className="sr-only">{t('wizard.result.newTab')}</span></a>}
            <Button variant="quiet" onClick={onRestart}>{t('wizard.result.again')}</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
