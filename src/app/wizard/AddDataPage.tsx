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
import { defaultSar, FIXED_NAMES, PRESET_GEE, isS2, ORBIT_OPTIONS, pairingActive, presetSar, S2_COLLECTION, sarError, sarRequest, SarState, WATER_BANDS, WATER_NAME, withPairingBlockers } from './sarModel';
import './wizard.css';
import { useT } from '../../i18n';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

type Method = 'geotiff' | 'shape' | 'gee' | 'zarr';
type RasterKind = 'geotiff' | 'cas500';
type GeeParams = { startDate: string; endDate: string; maxCloudPercent: string; scaleMeters: string };
type Rgb = { red: string; green: string; blue: string };

const STEPS = ['방식 선택', '원본 입력', '자동 검사 결과', '설정', '확인 및 생성'];
const METHODS: Array<{ id: Method; title: string; text: string; hint: string; icon: ReactNode; group: '생성' | '등록' }> = [
  { id: 'geotiff', title: 'GeoTIFF / CAS500', text: '위성 영상 파일로 Zarr를 만듭니다.', hint: '.tif 또는 밴드별 TIFF + Aux.xml ZIP', icon: <Image size={22} />, group: '생성' },
  { id: 'shape', title: 'Shapefile', text: '벡터 속성을 격자로 바꿔 Zarr를 만듭니다.', hint: '.shp .shx .dbf .prj를 담은 ZIP', icon: <FileArchive size={22} />, group: '생성' },
  { id: 'gee', title: 'Google Earth Engine', text: '위성 자료를 골라 기간·영역으로 받습니다.', hint: '컬렉션·기간·영역 선택 · 수 분 ~ 수십 분', icon: <Globe2 size={22} />, group: '생성' },
  { id: 'zarr', title: 'Zarr 등록', text: '이미 만든 Zarr를 경로로 등록합니다.', hint: '서버 경로 또는 s3:// URI', icon: <Database size={22} />, group: '등록' },
];
const REQUIRED_SHAPE = ['.shp', '.shx', '.dbf', '.prj'];
const TERMINAL = ['SUCCEEDED', 'FAILED', 'CANCELLED'];
// Sensor IDs known to the normalisation registry (Backend technical guide). Others can be typed in.
const SENSORS = [
  { id: 'SENTINEL2_L2A', label: 'Sentinel-2 L2A' },
  { id: 'LANDSAT_C2_L2', label: 'Landsat Collection 2 L2' },
  { id: 'CAS500_1_L2', label: '국토위성 CAS500-1' },
];
// Workers read the time from file names: 14 digits (YYYYMMDDHHMMSS) for rasters, 6 digits (YYYYMM) for Shapefiles.
const hasTimeInName = (fileName: string, method: Method) => (method === 'shape' ? /\d{6}/ : /\d{14}/).test(fileName);
const STATUS_LABEL: Record<string, string> = { QUEUED: '대기 중', RUNNING: '처리 중', SUCCEEDED: '완료', FAILED: '실패', CANCELLED: '취소됨' };

/** Preset "수체 분석용 S1+S2" (UR-41): S2 optical bands under the names the AI looks for, plus Sentinel-1 VV·VH and the JRC reference. */
const WATER_PRESET = { title: '수체 분석용 (Sentinel-2 + Sentinel-1)', text: 'AI 수체 추출에 필요한 광학 5 band와 레이더 VV·VH를 같은 위치·비슷한 날짜로 받습니다' };
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
const sarSummary = (sar: SarState) => `Sentinel-1 VV·VH · 날짜 차이 최대 ${sar.maxDaysApart}일 · 궤도 ${ORBIT_OPTIONS.find((item) => item.id === sar.orbitPass)?.label} · 짝 없는 날짜 ${sar.keepUnpaired ? '레이더 없이 남김' : '제외'}${sar.waterReference ? ' · 참조 수체(JRC)' : ''}`;

const fieldsOf = (inspection: SpatialInspection | null): InspectionField[] =>
  inspection ? inspection.fields ?? inspection.bands.map((name) => ({ name })) : [];
/** The estimate does not depend on the dataset name, so it uses a fixed one: typing the name never re-estimates. */
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
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<Method | null>(null);
  const [rasterKind, setRasterKind] = useState<RasterKind>('geotiff');
  const [inspection, setInspection] = useState<SpatialInspection | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState('');
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
  const [submitError, setSubmitError] = useState('');
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [registeredId, setRegisteredId] = useState('');
  const colorBars = useLoad<ColorBarOption[]>(() => generation.colorBars(), [], 'ko'); // wizard stays Korean until UR-53 stage 3
  const collections = useLoad<GeeCollection[]>(() => (method === 'gee' ? generation.collections() : Promise.resolve([])), [method], 'ko');
  const projects = useLoad(() => appApi.listProjects(), [], 'ko');
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
  const resolved = useMemo(() => resolveArea(area), [area]);
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
  const dateProblem = selectionProblem(dateSelection, estimateDateList, pairing ? { keepUnpaired: sar.keepUnpaired } : null);
  const pickDates = (picked: string[]) => { if (estimateDateList) setDateSel({ scope: dateScope, all: estimateDateList.map((item) => item.date), picked }); };
  // Dates and blockers come from the estimate, so a GEE request cannot go on before the estimate for these inputs is in.
  const estimatePending = method === 'gee' && step >= 1 && estimate.status !== 'ok';
  const estimateWait = !estimatePending ? '' : estimate.status === 'loading' ? '예상 크기를 계산하는 중입니다.' : estimate.status === 'error' ? '예상 크기를 불러오지 못해 진행할 수 없습니다.' : '';
  const estimateHint = !collectionId ? '컬렉션을 고르세요.' : !datesOk ? '기간을 입력하세요.' : resolved.error;
  const noun = method === 'shape' ? '속성' : 'band';
  const continuous = choices.filter((choice) => choice.kind === 'continuous');
  const rgbPossible = (method === 'gee' || method === 'geotiff') && continuous.length >= 3;
  const variableErrors = validateChoices(choices, colorBars.data ?? []);
  const editableProjects = (projects.data ?? []).filter(canEditProject);
  // CAS500 and Shapefile get sensor/mode defaults on the server; a generic GeoTIFF needs them from the user.
  const genericRaster = method === 'geotiff' && rasterKind === 'geotiff';
  const sensorValue = sensor === 'custom' ? customSensor.trim() : sensor;
  const fileInputs = method === 'geotiff' || method === 'shape';
  const dateRequired = fileInputs && !(method === 'geotiff' && rasterKind === 'cas500') && !!inspection && !hasTimeInName(inspection.fileName, method!);

  const chooseMethod = (next: Method) => {
    if (next !== method) {
      setInspection(null); setInspectError(''); setChoices([]); setCollectionId(''); setRgbOn(false); setName(''); setSar(defaultSar()); setPreset(false);
    }
    setMethod(next);
  };
  const inspectFile = async (file: File) => {
    if (!method || method === 'gee' || method === 'zarr') return;
    const type = method === 'shape' ? 'shapefile' : rasterKind;
    setInspecting(true); setInspectError(''); setInspection(null); setChoices([]);
    try {
      const result = await generation.inspect(type, file);
      setInspection(result);
      if (!name) setName(result.fileName.replace(/\.(zip|tiff?)$/i, ''));
    } catch (cause) {
      setInspectError(userMessage(cause));
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
    if (index === 0) return method ? '' : '생성 방식을 고르세요.';
    if (index === 1) {
      if (method === 'gee') {
        if (!collectionId) return '컬렉션을 고르세요.';
        if (!gee.startDate || !gee.endDate) return '기간을 입력하세요.';
        if (gee.startDate > gee.endDate) return '시작 날짜가 끝 날짜보다 늦습니다.';
        if (resolved.error) return resolved.error;
        if (pairing && sarError(sar)) return sarError(sar);
        if (estimatePending) return estimateWait || '예상 크기를 아직 계산하지 않았습니다.';
        if (blockers.length) return blockerText(blockers[0]);
        if (dateProblem) return dateProblem;
        return '';
      }
      if (method === 'zarr') return storageUri.trim() ? '' : 'Zarr 경로를 입력하세요.';
      return inspection ? '' : inspecting ? '파일을 검사하고 있습니다.' : '파일을 올려 검사를 마치세요.';
    }
    if (index === 3) {
      if (!name.trim()) return '데이터 이름을 입력하세요.';
      if (!choices.length) return `만들 ${noun}을 하나 이상 고르세요.`;
      if (Object.keys(variableErrors).length) return '표시 설정을 확인하세요.';
      if (pairing && choices.some((choice) => (FIXED_NAMES as readonly string[]).includes(choice.name.trim()))) return `${FIXED_NAMES.join('·')}는 레이더·참조 변수 이름이라 band 이름으로 쓸 수 없습니다.`;
      if (method === 'shape' && !(Number(resolution) > 0)) return '출력 해상도를 확인하세요.';
      if (genericRaster && !sensorValue) return '위성·센서를 고르거나 입력하세요.';
      if (dateRequired && !obsDate) return '파일 이름에 날짜가 없어 관측 날짜가 필요합니다.';
      if (nodata !== '' && !Number.isFinite(Number(nodata))) return 'nodata 값은 숫자로 입력하세요.';
      if (rgbOn && rgbPossible && !(rgb.red && rgb.green && rgb.blue)) return 'RGB 세 채널을 모두 고르세요.';
      if (method !== 'zarr' && !colorBars.data?.length) return '색상표를 불러오지 못했습니다.';
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
    setSubmitting(true); setSubmitError('');
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
      setSubmitError(cause instanceof ApiError && cause.status === 404 && method !== 'gee' && method !== 'zarr'
        ? '지금은 서버에서 파일로 데이터를 만들 수 없습니다. 입력한 설정은 그대로 남아 있으니 잠시 후 다시 시도하거나 관리자에게 알려 주세요.'
        : userMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) return <Result job={job} registeredId={registeredId} name={name} projectLinked={!!projectId && method !== 'zarr'} onRestart={onRestart} />;
  const problem = showErrors ? stepValid(step) : '';

  return (
    <div className="page-stack wizard">
      <PageHeader back={<Link className="page-back" to="/app/data"><ArrowLeft size={16} aria-hidden />데이터</Link>} title="데이터 추가" description="원본 데이터를 Zarr로 만들거나 이미 있는 Zarr를 등록합니다." />
      <ol className="wizard-steps" aria-label="진행 단계">
        {STEPS.map((label, index) => (
          <li key={label} className={index === step ? 'is-current' : index < step ? 'is-done' : ''} aria-current={index === step ? 'step' : undefined}>
            <span className="wizard-steps__dot">{index < step ? <Check size={14} aria-hidden /> : index + 1}</span>
            <span className="wizard-steps__label">{label}</span>
          </li>
        ))}
      </ol>

      <Card className="wizard-card">
        <div className="wizard-body">
          <h2 className="wizard-title" ref={headingRef} tabIndex={-1}>{STEPS[step]}</h2>

          {step === 0 && (
            <RadioGroup className="method-grid" label="데이터 추가 방식">
              {METHODS.map((item) => (
                <button key={item.id} type="button" role="radio" aria-checked={method === item.id} className={`method-card ${method === item.id ? 'is-on' : ''}`} onClick={() => chooseMethod(item.id)}>
                  <span className="method-card__icon" aria-hidden>{item.icon}</span>
                  <span className="method-card__text">
                    <span className="method-card__title">{item.title} <Badge tone={item.group === '등록' ? 'neutral' : 'primary'}>{item.group}</Badge></span>
                    <span>{item.text}</span>
                    <small>{item.hint}</small>
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
                  <span className="xc-label">파일 종류</span>
                  <div className="segmented" role="group" aria-label="파일 종류">
                    <button type="button" aria-pressed={rasterKind === 'geotiff'} onClick={() => { setRasterKind('geotiff'); setInspection(null); setChoices([]); }}>일반 GeoTIFF</button>
                    <button type="button" aria-pressed={rasterKind === 'cas500'} onClick={() => { setRasterKind('cas500'); setInspection(null); setChoices([]); }}>CAS500 (밴드별 TIFF ZIP)</button>
                  </div>
                </div>
              )}
              <FileDrop
                accept={method === 'shape' || rasterKind === 'cas500' ? '.zip,application/zip' : '.tif,.tiff,image/tiff'}
                title={method === 'shape' ? 'Shapefile ZIP을 끌어 놓거나 선택하세요' : rasterKind === 'cas500' ? 'CAS500 ZIP을 끌어 놓거나 선택하세요' : 'GeoTIFF 파일을 끌어 놓거나 선택하세요'}
                hint={method === 'shape' ? '같은 이름의 .shp · .shx · .dbf · .prj가 필요합니다.' : rasterKind === 'cas500' ? '밴드 TIFF(_B, _G, _R, _N)와 _Aux.xml을 함께 압축하세요.' : '.tif · .tiff · GDAL이 좌표와 밴드를 자동으로 읽습니다.'}
                busy={inspecting}
                fileName={inspection?.fileName}
                onFile={inspectFile}
              />
              {inspectError && <Alert tone="danger">파일을 검사하지 못했습니다. {inspectError}</Alert>}
              {inspection && <Alert tone="success">{inspection.message}</Alert>}
            </div>
          )}

          {step === 1 && method === 'gee' && (
            <div className="wizard-section">
              <div className="catalog">
                <p className="xc-hint">처리 방법을 확인한 위성 자료만 고를 수 있습니다.</p>
                <label className="toolbar__search" style={{ maxWidth: 'none' }}>
                  <Search size={16} aria-hidden />
                  <input type="search" value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="컬렉션 이름·ID 검색" aria-label="GEE 컬렉션 검색" />
                </label>
                {collections.loading ? <Skeleton lines={3} label="GEE 컬렉션을 불러오는 중" /> : collections.error ? (
                  <Alert tone="danger">GEE 목록을 불러오지 못했습니다. {collections.error}</Alert>
                ) : (
                  <RadioGroup className="catalog__list" label="GEE 컬렉션">
                    {(collections.data ?? []).some((item) => item.id === S2_COLLECTION) && [WATER_PRESET.title, WATER_PRESET.text, '수체 S1 S2 water'].some((text) => text.toLowerCase().includes(catalogQuery.trim().toLowerCase())) && (
                      <>
                        <button type="button" role="radio" aria-checked={preset} className={`catalog__item ${preset ? 'is-on' : ''}`} onClick={choosePreset}>
                          <span className="xc-cell-main"><strong>{WATER_PRESET.title}</strong><small>{WATER_PRESET.text}</small></span>
                          <Badge><Droplets size={12} aria-hidden /> 프리셋</Badge>
                        </button>
                        <p className="catalog__group" aria-hidden>컬렉션</p>
                      </>
                    )}
                    {(collections.data ?? []).filter((item) => [item.id, item.name, item.title].some((text) => text?.toLowerCase().includes(catalogQuery.trim().toLowerCase()))).map((item) => (
                      <button key={item.id} type="button" role="radio" aria-checked={!preset && collectionId === item.id} className={`catalog__item ${!preset && collectionId === item.id ? 'is-on' : ''}`} onClick={() => chooseCollection(item.id)}>
                        <span className="xc-cell-main"><strong>{item.title || item.name || item.id}</strong><small>{item.id}</small></span>
                        <Badge>band {item.bands.length}</Badge>
                      </button>
                    ))}
                  </RadioGroup>
                )}
              </div>
              {isS2(collectionId) && <SarOptions sar={sar} onChange={changeSar} showErrors={showErrors} />}
              <div className="form-grid">
                <TextField label="시작 날짜" type="date" value={gee.startDate} onChange={(event) => setGee({ ...gee, startDate: event.target.value })} />
                <TextField label="끝 날짜" type="date" value={gee.endDate} onChange={(event) => setGee({ ...gee, endDate: event.target.value })} />
                <TextField label="최대 구름량 (%)" type="number" min={0} max={100} value={gee.maxCloudPercent} onChange={(event) => setGee({ ...gee, maxCloudPercent: event.target.value })} />
                <TextField label="픽셀 크기 (m)" type="number" min={10} max={10000} value={gee.scaleMeters} onChange={(event) => setGee({ ...gee, scaleMeters: event.target.value })} />
              </div>
              <AreaStep area={area} onChange={setArea} resolved={resolved} estimate={estimate} estimateHint={estimateHint} showErrors={showErrors} pairing={pairing ? { keepUnpaired: sar.keepUnpaired } : undefined} dates={dateSelection ? { picked: dateSelection.picked, onChange: pickDates } : undefined} />
            </div>
          )}

          {step === 1 && method === 'zarr' && (
            <div className="wizard-section">
              <TextField label="Zarr 경로 / URI" placeholder="/data/sample.zarr 또는 s3://bucket/sample.zarr" value={storageUri} onChange={(event) => setStorageUri(event.target.value)} help="서버가 읽을 수 있는 폴더 경로나 s3:// 주소를 입력하세요." />
            </div>
          )}

          {step === 2 && <InspectionSummary method={method!} rasterKind={rasterKind} inspection={inspection} collection={collection} gee={gee} resolved={resolved} storageUri={storageUri} fields={fields} sarText={pairing ? sarSummary(sar) : ''} />}

          {step === 3 && (
            <div className="wizard-section">
              <div className="form-grid">
                <TextField label="데이터 이름" value={name} maxLength={150} placeholder="예: 울산 행정구역 2026" onChange={(event) => setName(event.target.value)} error={showErrors && !name.trim() ? '데이터 이름을 입력하세요.' : undefined} />
                <label className="xc-field">
                  <span className="xc-label">연결할 프로젝트 <span className="xc-hint">(선택)</span></span>
                  <select className="xc-select" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                    <option value="">프로젝트 없음</option>
                    {editableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </label>
                {method === 'shape' && <TextField label="출력 해상도 (도)" type="number" step="0.000001" min={0.000001} value={resolution} onChange={(event) => setResolution(event.target.value)} help="약 0.00025° ≈ 25m" />}
                {genericRaster && (
                  <label className="xc-field">
                    <span className="xc-label">위성·센서</span>
                    <select className="xc-select" aria-label="위성·센서" value={sensor} onChange={(event) => setSensor(event.target.value)} aria-invalid={showErrors && !sensorValue ? true : undefined}>
                      <option value="">선택하세요</option>
                      {SENSORS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                      <option value="custom">기타 (직접 입력)</option>
                    </select>
                    <span className="xc-hint">융합·AI에서 위성별 정규화식을 고를 때 씁니다.</span>
                  </label>
                )}
                {genericRaster && sensor === 'custom' && <TextField label="센서 이름" placeholder="예: PLANETSCOPE" value={customSensor} maxLength={64} onChange={(event) => setCustomSensor(event.target.value.toUpperCase())} error={showErrors && !customSensor.trim() ? '센서 이름을 입력하세요.' : undefined} />}
                {fileInputs && !(method === 'geotiff' && rasterKind === 'cas500') && (
                  <TextField
                    label={dateRequired ? '관측 날짜' : '관측 날짜 (선택)'}
                    type="date"
                    value={obsDate}
                    onChange={(event) => setObsDate(event.target.value)}
                    help={dateRequired ? `파일 이름에 ${method === 'shape' ? 'YYYYMM' : 'YYYYMMDDHHMMSS'} 날짜가 없어 꼭 입력해야 합니다.` : '비워 두면 파일 이름의 날짜를 씁니다.'}
                    error={showErrors && dateRequired && !obsDate ? '관측 날짜를 입력하세요.' : undefined}
                  />
                )}
                {fileInputs && <TextField label="nodata 값 (선택)" type="number" step="any" value={nodata} onChange={(event) => setNodata(event.target.value)} help="파일에 nodata가 없는 정수 데이터는 입력해야 합니다. 예: 0" />}
              </div>
              {colorBars.error && method !== 'zarr' && <Alert tone="danger">색상표를 불러오지 못했습니다. {colorBars.error}</Alert>}
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
                  <label className="xc-check"><input type="checkbox" checked={rgbOn} onChange={(event) => setRgbOn(event.target.checked)} /><span><strong>RGB 컬러 영상도 만들기</strong> <span className="xc-hint">고른 band 중 세 개를 빨강·초록·파랑에 배치합니다. 범위는 각 band의 표시 범위를 씁니다.</span></span></label>
                  {rgbOn && (
                    <div className="form-grid">
                      {(['red', 'green', 'blue'] as const).map((channel) => (
                        <label className="xc-field" key={channel}>
                          <span className="xc-label">{channel === 'red' ? '빨강 (R)' : channel === 'green' ? '초록 (G)' : '파랑 (B)'}</span>
                          <select className="xc-select" value={rgb[channel]} onChange={(event) => setRgb({ ...rgb, [channel]: event.target.value })}>
                            <option value="">band 선택</option>
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
                <dt>방식</dt><dd>{METHODS.find((item) => item.id === method)?.title}{method === 'geotiff' ? ` · ${rasterKind === 'cas500' ? 'CAS500' : '일반 GeoTIFF'}` : ''}</dd>
                <dt>원본</dt><dd>{method === 'gee' ? `${collection?.title || collection?.name || collectionId} · ${gee.startDate} ~ ${gee.endDate}` : method === 'zarr' ? storageUri : inspection?.fileName}</dd>
                {pairing && <><dt>레이더 짝</dt><dd>{sarSummary(sar)}</dd></>}
                {method === 'gee' && dateSelection && (
                  <>
                    <dt>날짜</dt>
                    <dd>
                      <span className="tabular">선택 {dateSelection.picked.length} / 전체 {dateSelection.all.length}개 날짜</span>
                      {dateSelection.picked.length > 0 && (
                        <details className="summary-dates">
                          <summary>고른 날짜 보기</summary>
                          <ul aria-label="고른 날짜">{[...dateSelection.picked].sort().map((date) => <li key={date} className="tabular">{date}</li>)}</ul>
                        </details>
                      )}
                    </dd>
                  </>
                )}
                {method === 'gee' && <><dt>영역</dt><dd>{resolved.modeLabel} · {resolved.label}<br /><span className="xc-hint">{resolved.clipLabel}{resolved.request?.maskVariable ? ' · 경계선 표시 변수 저장' : ''}</span></dd></>}
                <dt>이름</dt><dd>{name}</dd>
                <dt>프로젝트</dt><dd>{editableProjects.find((item) => item.id === projectId)?.name ?? '프로젝트 없음'}</dd>
                <dt>변수</dt>
                <dd>
                  <ul className="summary-vars">
                    {choices.map((choice) => (
                      <li key={choice.source}>
                        <strong>{choice.name}</strong>
                        {choice.name !== choice.source && <span className="xc-hint"> ← {choice.source}</span>}
                        <span className="xc-hint"> · {choice.colorBar} · {choice.kind === 'continuous' ? `${choice.min} ~ ${choice.max}` : '범주형'}</span>
                      </li>
                    ))}
                    {pairing && ['vv', 'vh', ...(sar.waterReference ? ['water_gt'] : [])].map((fixed) => (
                      <li key={fixed}><strong>{fixed}</strong><span className="xc-hint"> · {fixed === 'water_gt' ? '참조 수체(JRC) · 범주형 · 비교용' : '레이더 · dB · 회색조'}</span></li>
                    ))}
                  </ul>
                </dd>
                {rgbOn && rgbPossible && <><dt>RGB</dt><dd>R {rgb.red} · G {rgb.green} · B {rgb.blue}</dd></>}
                {method === 'shape' && <><dt>해상도</dt><dd>{resolution}°</dd></>}
                {genericRaster && <><dt>위성·센서</dt><dd>{SENSORS.find((item) => item.id === sensorValue)?.label ?? sensorValue}</dd></>}
                {obsDate && <><dt>관측 날짜</dt><dd>{obsDate}</dd></>}
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
          <Button variant="secondary" onClick={back} disabled={step === 0 || submitting}><ArrowLeft size={16} aria-hidden />이전</Button>
          <span className="xc-hint">{step + 1} / {STEPS.length}</span>
          {estimateWait && (step === 1 || step === STEPS.length - 1) && (
            <span className="xc-hint wizard-foot__wait" role="status" id="estimate-wait">
              {estimate.status === 'loading' && <Loader2 size={14} className="spin" aria-hidden />}{estimateWait}
              {estimate.retry && <Button variant="line" size="sm" onClick={estimate.retry}>다시 계산</Button>}
            </span>
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={next} disabled={inspecting || (step === 1 && !!estimateWait) || (step === 1 && (blockers.length > 0 || !!dateProblem))} aria-describedby={estimateWait ? 'estimate-wait' : undefined}>다음<ArrowRight size={16} aria-hidden /></Button>
          ) : (
            <Button onClick={submit} disabled={submitting || estimatePending || blockers.length > 0 || !!dateProblem} aria-describedby={estimateWait ? 'estimate-wait' : undefined}>{submitting ? <><Loader2 size={16} className="spin" aria-hidden />요청 중…</> : method === 'zarr' ? '등록' : '생성 시작'}</Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function FileDrop({ accept, title, hint, busy, fileName, onFile }: { accept: string; title: string; hint: string; busy: boolean; fileName?: string; onFile: (file: File) => void }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const take = (file?: File) => { if (file) onFile(file); };
  const onDrop = (event: DragEvent) => { event.preventDefault(); setOver(false); take(event.dataTransfer.files?.[0]); };
  return (
    <div className={`file-drop ${over ? 'is-over' : ''}`} onDragOver={(event) => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <span className="file-drop__icon" aria-hidden>{busy ? <Loader2 size={24} className="spin" /> : <UploadCloud size={24} />}</span>
      <strong>{busy ? 'GDAL로 검사하는 중…' : fileName ? fileName : title}</strong>
      <small>{hint}</small>
      <input ref={inputRef} type="file" accept={accept} hidden onChange={(event: ChangeEvent<HTMLInputElement>) => { take(event.target.files?.[0]); event.target.value = ''; }} aria-label="파일 선택" />
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>{fileName ? '다른 파일 선택' : '파일 선택'}</Button>
    </div>
  );
}

function InspectionSummary({ method, rasterKind, inspection, collection, gee, resolved, storageUri, fields, sarText }: { method: Method; rasterKind: RasterKind; inspection: SpatialInspection | null; collection?: GeeCollection; gee: GeeParams; resolved: ResolvedArea; storageUri: string; fields: InspectionField[]; sarText: string }) {
  if (method === 'zarr') {
    return <div className="wizard-section"><Alert>등록하면 서버가 <strong>{storageUri}</strong>의 좌표계(EPSG:4326)·변수·시간 정보를 검사합니다. 문제가 있으면 데이터 목록에서 상태로 알려 드립니다.</Alert></div>;
  }
  if (method === 'gee') {
    return (
      <div className="wizard-section">
        <div className="inspect-grid">
          {resolved.bbox && <BBoxMap bbox={resolved.bbox} />}
          <dl className="meta-list">
            <dt>컬렉션</dt><dd>{collection?.title || collection?.name}<br /><span className="xc-hint">{collection?.id}</span></dd>
            <dt>기간</dt><dd className="tabular">{gee.startDate} ~ {gee.endDate}</dd>
            <dt>영역</dt><dd>{resolved.modeLabel} · {resolved.label}<br /><span className="xc-hint">{resolved.clipLabel}</span></dd>
            <dt>픽셀 크기</dt><dd>{gee.scaleMeters} m · 구름 {gee.maxCloudPercent}% 이하</dd>
            <dt>band</dt><dd>{fields.length}개</dd>
            {sarText && <><dt>레이더 짝</dt><dd>{sarText}<br /><span className="xc-hint">같은 위치(영역을 99% 이상 덮음), 가까운 날짜의 레이더 영상</span></dd></>}
            <dt>좌표계</dt><dd>EPSG:4326으로 저장</dd>
          </dl>
        </div>
        <Alert>요청 크기가 GEE 한도를 넘으면 서버가 영역을 나눠 받습니다. 다음 단계에서 필요한 band만 고르면 시간이 줄어듭니다.</Alert>
      </div>
    );
  }
  if (!inspection) return <Alert tone="warning">검사 결과가 없습니다. 이전 단계에서 파일을 다시 올려 주세요.</Alert>;
  const bounds = inspection.bounds;
  const lower = inspection.files.map((file) => file.toLowerCase());
  return (
    <div className="wizard-section">
      <div className="inspect-grid">
        {bounds ? <BBoxMap bbox={[bounds.west, bounds.south, bounds.east, bounds.north]} /> : <div className="xc-hint" style={{ padding: 20 }}>범위 정보 없음</div>}
        <dl className="meta-list">
          <dt>파일</dt><dd>{inspection.fileName}</dd>
          <dt>종류</dt><dd>{method === 'shape' ? 'Shapefile' : rasterKind === 'cas500' ? 'CAS500' : 'GeoTIFF'}</dd>
          <dt>범위</dt><dd className="tabular">{bounds ? `${bounds.west.toFixed(4)}, ${bounds.south.toFixed(4)} → ${bounds.east.toFixed(4)}, ${bounds.north.toFixed(4)}` : '—'}</dd>
          {inspection.width && <><dt>크기</dt><dd className="tabular">{inspection.width.toLocaleString()} × {inspection.height?.toLocaleString()} px</dd></>}
          <dt>{method === 'shape' ? '속성' : 'band'}</dt><dd>{fields.length}개 · {fields.map((field) => field.name).join(', ')}</dd>
          <dt>좌표계</dt><dd>EPSG:4326으로 변환해 저장</dd>
        </dl>
      </div>
      {method === 'shape' && (
        <ul className="checklist" aria-label="필수 구성파일">
          {REQUIRED_SHAPE.map((ext) => {
            const ok = lower.some((file) => file.endsWith(ext));
            return <li key={ext} className={ok ? 'ok' : 'missing'}>{ok ? <CheckCircle2 size={16} aria-hidden /> : <CloudDownload size={16} aria-hidden />}{ext} {ok ? '있음' : '없음'}</li>;
          })}
        </ul>
      )}
      {fields.some((field) => autoRange(field.approxStats)) ? (
        <Alert tone="success">GDAL이 값 범위를 계산했습니다. 다음 단계에서 표시 범위가 자동으로 채워집니다.</Alert>
      ) : (
        <Alert>이 파일은 값 범위를 미리 계산하지 못했습니다. 다음 단계에서 표시 범위를 직접 입력하세요.</Alert>
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
  return (
    <div className="page-stack wizard">
      <PageHeader title="데이터 추가" />
      <Card>
        <div className="wizard-result">
          <span className={`wizard-result__icon ${failed ? 'is-failed' : registeredId || finished ? '' : 'is-running'}`} aria-hidden>{registeredId || finished ? <CheckCircle2 size={28} /> : failed ? '!' : <Loader2 size={28} className="spin" />}</span>
          <h2 className="wizard-title">{registeredId ? '등록을 요청했습니다' : finished ? '생성이 끝났습니다' : failed ? '생성에 실패했습니다' : '생성 작업을 시작했습니다'}</h2>
          <p role="status">
            “{name}” {registeredId ? '등록이 완료되었습니다. 시각화 서버 동기화가 끝나면 Viewer에서 볼 수 있습니다.' : <>작업 {String(job?.id)} · <strong>{STATUS_LABEL[status ?? ''] ?? status}</strong>{!finished && !failed ? ' · 이 화면을 닫아도 작업은 계속됩니다.' : ''}</>}
          </p>
          {finished && !datasetId && !registrationError && <p className="xc-hint" role="status">데이터 목록에 등록하는 중입니다…</p>}
          {finished && registrationError && <Alert tone="warning">데이터 목록 등록에 실패했습니다: {registrationError}</Alert>}
          {projectLinked && !registeredId && <p className="xc-hint">프로젝트 연결은 생성이 끝난 뒤 데이터 화면에서 확인하세요.</p>}
          <div className="wizard-result__actions">
            {datasetId ? <ButtonLink to={`/app/data/${encodeURIComponent(datasetId)}`}>데이터 보기</ButtonLink> : <ButtonLink to="/app/jobs">작업 센터에서 보기</ButtonLink>}
            {datasetId && <a className="xc-btn xc-btn--line" href={viewerHref(datasetId)} target="_blank" rel="noopener noreferrer">Viewer에서 열기<span className="sr-only">(새 탭)</span></a>}
            <Button variant="quiet" onClick={onRestart}>다른 데이터 추가</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
