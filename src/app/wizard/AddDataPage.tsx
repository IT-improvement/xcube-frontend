// S4 data add wizard: method → source → inspection → settings → confirm.
// Replaces the Viewer's ZarrStudio panel (GeoTIFF/CAS500, Shapefile, GEE, Zarr register).
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CloudDownload, Database, FileArchive, Globe2, Image, Loader2, Search, UploadCloud } from 'lucide-react';
import { ChangeEvent, DragEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, userMessage } from '../../api/httpClient';
import { ColorBarOption, GeeCollection, GenerationJob, InspectionField, SpatialInspection } from '../../api/generationApi';
import { Alert, Button, ButtonLink, TextField } from '../../components/ui';
import { Badge, Card, PageHeader, Skeleton } from '../../components/ui/kit';
import { appApi, canEditProject, generation, viewerHref } from '../api';
import { BBoxMap } from '../pages/DatasetDetailPage';
import { useLoad } from '../useLoad';
import VariableStyleEditor, { autoRange, toVariableSpecs, validateChoices, VariableChoice } from './VariableStyleEditor';
import './wizard.css';

type Method = 'geotiff' | 'shape' | 'gee' | 'zarr';
type RasterKind = 'geotiff' | 'cas500';
type Bounds = { west: string; south: string; east: string; north: string };
type GeeParams = { startDate: string; endDate: string; maxCloudPercent: string; scaleMeters: string } & Bounds;
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

const fieldsOf = (inspection: SpatialInspection | null): InspectionField[] =>
  inspection ? inspection.fields ?? inspection.bands.map((name) => ({ name })) : [];
const numberOk = (value: string) => value !== '' && Number.isFinite(Number(value));

export default function AddDataPage() {
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<Method | null>(null);
  const [rasterKind, setRasterKind] = useState<RasterKind>('geotiff');
  const [inspection, setInspection] = useState<SpatialInspection | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [gee, setGee] = useState<GeeParams>({ startDate: '', endDate: '', maxCloudPercent: '20', scaleMeters: '30', west: '', south: '', east: '', north: '' });
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
  const colorBars = useLoad<ColorBarOption[]>(() => generation.colorBars());
  const collections = useLoad<GeeCollection[]>(() => (method === 'gee' ? generation.collections() : Promise.resolve([])), [method]);
  const projects = useLoad(() => appApi.listProjects());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const done = !!job || !!registeredId;

  // Leaving the tab mid-way loses the inputs; ask first.
  useEffect(() => {
    if (step === 0 || done) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [step, done]);
  useEffect(() => { headingRef.current?.focus(); }, [step]);

  // Poll the generation job until it finishes.
  useEffect(() => {
    if (!job || TERMINAL.includes(job.status)) return;
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
      setInspection(null); setInspectError(''); setChoices([]); setCollectionId(''); setRgbOn(false); setName('');
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

  const stepValid = (index: number): string => {
    if (index === 0) return method ? '' : '생성 방식을 고르세요.';
    if (index === 1) {
      if (method === 'gee') {
        if (!collectionId) return '컬렉션을 고르세요.';
        if (!gee.startDate || !gee.endDate) return '기간을 입력하세요.';
        if (gee.startDate > gee.endDate) return '시작 날짜가 끝 날짜보다 늦습니다.';
        if (!(['west', 'south', 'east', 'north'] as const).every((key) => numberOk(gee[key]))) return '영역 좌표 네 개를 모두 입력하세요.';
        if (Number(gee.west) >= Number(gee.east) || Number(gee.south) >= Number(gee.north)) return '좌하단 좌표는 우상단 좌표보다 작아야 합니다.';
        return '';
      }
      if (method === 'zarr') return storageUri.trim() ? '' : 'Zarr 경로를 입력하세요.';
      return inspection ? '' : inspecting ? '파일을 검사하고 있습니다.' : '파일을 올려 검사를 마치세요.';
    }
    if (index === 3) {
      if (!name.trim()) return '데이터 이름을 입력하세요.';
      if (!choices.length) return `만들 ${noun}을 하나 이상 고르세요.`;
      if (Object.keys(variableErrors).length) return '표시 설정을 확인하세요.';
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
          bounds: { west: Number(gee.west), south: Number(gee.south), east: Number(gee.east), north: Number(gee.north) },
          bandStyles: choices.map((item) => ({ variable: item.source, colorBar: item.colorBar, valueMin: Number(item.min), valueMax: Number(item.max) })),
          rgbStyle,
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
        ? '파일 생성 API가 아직 서버에 연결되지 않았습니다. (M1 진행 중) 입력한 설정은 그대로 남아 있습니다.'
        : userMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) return <Result job={job} registeredId={registeredId} name={name} projectLinked={!!projectId && method !== 'zarr'} />;
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
            <div className="method-grid" role="radiogroup" aria-label="데이터 추가 방식">
              {METHODS.map((item) => (
                <button key={item.id} type="button" role="radio" aria-checked={method === item.id} className={`method-card ${method === item.id ? 'is-on' : ''}`} onClick={() => chooseMethod(item.id)}>
                  <span className="method-card__icon" aria-hidden>{item.icon}</span>
                  <span className="method-card__text">
                    <span className="method-card__title">{item.title} <Badge tone={item.group === '등록' ? 'neutral' : 'primary'}>{item.group}</Badge></span>
                    <span>{item.text}</span>
                    <small>{item.hint}</small>
                  </span>
                  <span className="method-card__check" aria-hidden>{method === item.id && <Check size={16} />}</span>
                </button>
              ))}
            </div>
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
                <div className="catalog__tabs segmented" role="group" aria-label="카탈로그 범위">
                  <button type="button" aria-pressed="true">검증된 목록</button>
                  <button type="button" aria-pressed="false" disabled title="GEE 카탈로그 API(M1) 연결 후 제공">전체 검색 <small>준비 중</small></button>
                </div>
                <label className="toolbar__search" style={{ maxWidth: 'none' }}>
                  <Search size={16} aria-hidden />
                  <input type="search" value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="컬렉션 이름·ID 검색" aria-label="GEE 컬렉션 검색" />
                </label>
                {collections.loading ? <Skeleton lines={3} label="GEE 컬렉션을 불러오는 중" /> : collections.error ? (
                  <Alert tone="danger">GEE 목록을 불러오지 못했습니다. {collections.error}</Alert>
                ) : (
                  <div className="catalog__list" role="radiogroup" aria-label="GEE 컬렉션">
                    {(collections.data ?? []).filter((item) => [item.id, item.name, item.title].some((text) => text?.toLowerCase().includes(catalogQuery.trim().toLowerCase()))).map((item) => (
                      <button key={item.id} type="button" role="radio" aria-checked={collectionId === item.id} className={`catalog__item ${collectionId === item.id ? 'is-on' : ''}`} onClick={() => { if (item.id !== collectionId) { setCollectionId(item.id); setChoices([]); setRgbOn(false); } }}>
                        <span className="xc-cell-main"><strong>{item.title || item.name || item.id}</strong><small>{item.id}</small></span>
                        <Badge>band {item.bands.length}</Badge>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="form-grid">
                <TextField label="시작 날짜" type="date" value={gee.startDate} onChange={(event) => setGee({ ...gee, startDate: event.target.value })} />
                <TextField label="끝 날짜" type="date" value={gee.endDate} onChange={(event) => setGee({ ...gee, endDate: event.target.value })} />
                <TextField label="최대 구름량 (%)" type="number" min={0} max={100} value={gee.maxCloudPercent} onChange={(event) => setGee({ ...gee, maxCloudPercent: event.target.value })} />
                <TextField label="픽셀 크기 (m)" type="number" min={10} max={10000} value={gee.scaleMeters} onChange={(event) => setGee({ ...gee, scaleMeters: event.target.value })} />
              </div>
              <fieldset className="bounds-fieldset">
                <legend className="xc-label">생성 영역 (WGS84 경위도)</legend>
                <div className="form-grid">
                  <TextField label="좌하단 경도" type="number" step="any" placeholder="예: 126.50" value={gee.west} onChange={(event) => setGee({ ...gee, west: event.target.value })} />
                  <TextField label="좌하단 위도" type="number" step="any" placeholder="예: 35.00" value={gee.south} onChange={(event) => setGee({ ...gee, south: event.target.value })} />
                  <TextField label="우상단 경도" type="number" step="any" placeholder="예: 129.50" value={gee.east} onChange={(event) => setGee({ ...gee, east: event.target.value })} />
                  <TextField label="우상단 위도" type="number" step="any" placeholder="예: 37.00" value={gee.north} onChange={(event) => setGee({ ...gee, north: event.target.value })} />
                </div>
              </fieldset>
            </div>
          )}

          {step === 1 && method === 'zarr' && (
            <div className="wizard-section">
              <TextField label="Zarr 경로 / URI" placeholder="/data/sample.zarr 또는 s3://bucket/sample.zarr" value={storageUri} onChange={(event) => setStorageUri(event.target.value)} help="파일 전송(대용량 업로드)은 Data Uploading 서비스 연결 후 추가됩니다." />
            </div>
          )}

          {step === 2 && <InspectionSummary method={method!} rasterKind={rasterKind} inspection={inspection} collection={collection} gee={gee} storageUri={storageUri} fields={fields} />}

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
                onChange={(nextChoices) => { setChoices(nextChoices); if (rgbOn && nextChoices.filter((item) => item.kind === 'continuous').length < 3) setRgbOn(false); }}
                colorBars={colorBars.data ?? []}
                noun={noun}
                allowCustom={method === 'zarr'}
                renamable={method !== 'gee'}
                continuousOnly={method === 'gee'}
                errors={showErrors ? variableErrors : {}}
              />
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
                  </ul>
                </dd>
                {rgbOn && rgbPossible && <><dt>RGB</dt><dd>R {rgb.red} · G {rgb.green} · B {rgb.blue}</dd></>}
                {method === 'shape' && <><dt>해상도</dt><dd>{resolution}°</dd></>}
                {genericRaster && <><dt>위성·센서</dt><dd>{SENSORS.find((item) => item.id === sensorValue)?.label ?? sensorValue}</dd></>}
                {obsDate && <><dt>관측 날짜</dt><dd>{obsDate}</dd></>}
                {nodata !== '' && <><dt>nodata</dt><dd>{nodata}</dd></>}
              </dl>
              {submitError && <Alert tone="danger">{submitError}</Alert>}
            </div>
          )}

          {problem && <Alert tone="warning">{problem}</Alert>}
        </div>
        <div className="wizard-foot">
          <Button variant="secondary" onClick={back} disabled={step === 0 || submitting}><ArrowLeft size={16} aria-hidden />이전</Button>
          <span className="xc-hint">{step + 1} / {STEPS.length}</span>
          {step < STEPS.length - 1 ? (
            <Button onClick={next} disabled={inspecting}>다음<ArrowRight size={16} aria-hidden /></Button>
          ) : (
            <Button onClick={submit} disabled={submitting}>{submitting ? <><Loader2 size={16} className="spin" aria-hidden />요청 중…</> : method === 'zarr' ? '등록' : '생성 시작'}</Button>
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

function InspectionSummary({ method, rasterKind, inspection, collection, gee, storageUri, fields }: { method: Method; rasterKind: RasterKind; inspection: SpatialInspection | null; collection?: GeeCollection; gee: GeeParams; storageUri: string; fields: InspectionField[] }) {
  if (method === 'zarr') {
    return <div className="wizard-section"><Alert>등록하면 서버가 <strong>{storageUri}</strong>의 좌표계(EPSG:4326)·변수·시간 정보를 검사합니다. 문제가 있으면 데이터 목록에서 상태로 알려 드립니다.</Alert></div>;
  }
  if (method === 'gee') {
    const bbox: [number, number, number, number] = [Number(gee.west), Number(gee.south), Number(gee.east), Number(gee.north)];
    return (
      <div className="wizard-section">
        <div className="inspect-grid">
          <BBoxMap bbox={bbox} />
          <dl className="meta-list">
            <dt>컬렉션</dt><dd>{collection?.title || collection?.name}<br /><span className="xc-hint">{collection?.id}</span></dd>
            <dt>기간</dt><dd className="tabular">{gee.startDate} ~ {gee.endDate}</dd>
            <dt>영역</dt><dd className="tabular">{gee.west}, {gee.south} → {gee.east}, {gee.north}</dd>
            <dt>픽셀 크기</dt><dd>{gee.scaleMeters} m · 구름 {gee.maxCloudPercent}% 이하</dd>
            <dt>band</dt><dd>{fields.length}개</dd>
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
        <Alert>값 범위 자동 계산은 서버 검사 기능(M1) 연결 후 제공됩니다. 다음 단계에서 범위를 직접 입력하세요.</Alert>
      )}
    </div>
  );
}

function Result({ job, registeredId, name, projectLinked }: { job: GenerationJob | null; registeredId: string; name: string; projectLinked: boolean }) {
  const status = job?.status;
  const finished = status === 'SUCCEEDED';
  const failed = status === 'FAILED' || status === 'CANCELLED';
  return (
    <div className="page-stack wizard">
      <PageHeader title="데이터 추가" />
      <Card>
        <div className="wizard-result">
          <span className={`wizard-result__icon ${failed ? 'is-failed' : ''}`} aria-hidden>{registeredId || finished ? <CheckCircle2 size={28} /> : failed ? '!' : <Loader2 size={28} className="spin" />}</span>
          <h2 className="wizard-title">{registeredId ? '등록을 요청했습니다' : finished ? '생성이 끝났습니다' : failed ? '생성에 실패했습니다' : '생성 작업을 시작했습니다'}</h2>
          <p role="status">
            “{name}” {registeredId ? '등록이 완료되었습니다. 시각화 서버 동기화가 끝나면 Viewer에서 볼 수 있습니다.' : <>작업 {String(job?.id)} · <strong>{STATUS_LABEL[status ?? ''] ?? status}</strong>{!finished && !failed ? ' · 이 화면을 닫아도 작업은 계속됩니다.' : ''}</>}
          </p>
          {projectLinked && !registeredId && <p className="xc-hint">프로젝트 연결은 생성이 끝난 뒤 데이터 화면에서 확인하세요.</p>}
          <div className="wizard-result__actions">
            {registeredId ? <ButtonLink to={`/app/data/${encodeURIComponent(registeredId)}`}>데이터 보기</ButtonLink> : <ButtonLink to="/app/jobs">작업 센터에서 보기</ButtonLink>}
            {(registeredId || finished) && <a className="xc-btn xc-btn--secondary" href={viewerHref(registeredId || undefined)} target="_blank" rel="noopener noreferrer">Viewer에서 열기<span className="sr-only">(새 탭)</span></a>}
            <Button variant="ghost" onClick={() => window.location.reload()}>다른 데이터 추가</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
