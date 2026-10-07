// Demo (REACT_APP_USE_MOCK_API=true) stand-in for the AI Processing API (M7): three models, an input
// check against demo band lists, and in-memory jobs whose results carry per-time areas, a threshold
// curve and, for the dataset that has `water_gt`, reference metrics. Real mode never uses this module.
import type { AiCheck, AiCurve, AiJobRequest, AiModel, AiResult, AiWaterJob } from '../api/aiApi';
import type { TimePoint, ZarrDataset } from '../api/viewerAdapter';

const S1S2 = [
  { name: 'vv', aliases: ['vv', 'VV'] },
  { name: 'vh', aliases: ['vh', 'VH'] },
  { name: 'blue', aliases: ['blue', 'B2', 'SR_B2', 'B'] },
  { name: 'green', aliases: ['green', 'B3', 'SR_B3', 'G'] },
  { name: 'red', aliases: ['red', 'B4', 'SR_B4', 'R'] },
  { name: 'nir', aliases: ['nir', 'B8', 'SR_B5', 'N'] },
  { name: 'swir', aliases: ['swir', 'swir1', 'B11', 'SR_B6'] },
];
export const DEMO_MODELS: AiModel[] = [
  {
    id: 'ndwi-baseline', name: 'NDWI 기준선', kind: 'index',
    description: 'NDWI = (Green − NIR) / (Green + NIR)가 임계값보다 크면 물로 봅니다. 학습이 필요 없는 비교 기준입니다.',
    inputs: S1S2.filter((input) => input.name === 'green' || input.name === 'nir'), defaultThreshold: 0,
    note: '구름·그림자·탁한 물에서 틀리기 쉽습니다.',
  },
  {
    id: 'unet-s1s2-10ch', name: 'U-Net (S1+S2 10채널)', kind: 'deep',
    description: 'Sentinel-1 레이더(VV·VH)와 Sentinel-2 광학 5개 band, 지수 3개를 함께 보는 분할 모델입니다.',
    inputs: S1S2, defaultThreshold: 0.5, note: '물을 넓게 잡는 편입니다. 임계값을 높이면 면적이 줄어듭니다.',
  },
  {
    id: 'deeplabv3plus-s1s2-10ch', name: 'DeepLabV3+ (S1+S2 10채널)', kind: 'deep',
    description: 'U-Net과 같은 10채널 입력을 쓰는 DeepLabV3+ 분할 모델입니다. 경계가 조금 더 매끄럽습니다.',
    inputs: S1S2, defaultThreshold: 0.5, note: '물을 넓게 잡는 편입니다. 임계값을 높이면 면적이 줄어듭니다.',
  },
];

/** Band lists of the demo datasets: two "수체 분석용 S1+S2" cubes (one with `water_gt`) and a CAS500-like one. */
const DEMO_BANDS: Record<string, string[]> = {
  landsat: ['B2', 'B3', 'B4', 'B8', 'B11', 'VV', 'VH', 'water_gt'],
  sentinel: ['B2', 'B3', 'B4', 'B8', 'B11', 'VV', 'VH'],
  nakdong: ['blue', 'green', 'red', 'nir'],
};
const bandsOf = (dataset?: ZarrDataset) => (dataset ? DEMO_BANDS[dataset.id] ?? dataset.variables : []);

export function checkDemo(dataset: ZarrDataset | undefined, modelId: string): AiCheck {
  const model = DEMO_MODELS.find((item) => item.id === modelId);
  const bands = bandsOf(dataset);
  const matched: Record<string, string> = {};
  const missing: string[] = [];
  for (const input of model?.inputs ?? []) {
    const found = bands.find((band) => input.aliases.some((alias) => alias.toLowerCase() === band.toLowerCase()));
    if (found) matched[input.name] = found; else missing.push(input.name);
  }
  const unitDecisions: Record<string, string> = {};
  for (const name of Object.keys(matched)) unitDecisions[name] = name === 'vv' || name === 'vh' ? 'dB → ×100' : 'DN 그대로';
  const warnings = dataset?.id === 'nakdong' && model?.kind === 'deep' ? ['CAS500 광학 band만 있는 데이터입니다. (데모)'] : [];
  return { ready: !!model && !!dataset && missing.length === 0, matched, missing, unitDecisions, timeCount: dataset?.times.length ?? 0, grid: { width: 3008, height: 3715 }, warnings };
}

const SEASON = [38.2, 41.5, 46.9, 52.3, 49.8, 44.1, 40.6, 39.0];
const MODEL_SCALE: Record<string, number> = { 'ndwi-baseline': 0.88, 'unet-s1s2-10ch': 1, 'deeplabv3plus-s1s2-10ch': 0.97 };
const VALID_KM2 = 182.4;
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

/** Area falls as the threshold rises; the probability models use 0.05–0.95, NDWI −0.30–0.50. */
const curveThresholds = (modelId: string) =>
  modelId === 'ndwi-baseline'
    ? Array.from({ length: 17 }, (_, index) => round(-0.3 + index * 0.05))
    : Array.from({ length: 19 }, (_, index) => round(0.05 + index * 0.05));
const factor = (modelId: string, threshold: number) => (modelId === 'ndwi-baseline' ? 1 - 0.8 * threshold : 1.25 - 0.5 * threshold);

export function demoResult(times: TimePoint[], modelId: string, threshold: number, withGt: boolean): AiResult {
  const scale = MODEL_SCALE[modelId] ?? 1;
  const base = times.map((_, index) => SEASON[index % SEASON.length] * scale);
  // One cloudy acquisition: less valid area and no value at all for the third time.
  const valid = times.map((_, index) => (index === 2 ? null : index === 5 ? VALID_KM2 * 0.72 : VALID_KM2));
  const area = (index: number, at: number) => (valid[index] == null ? null : round(base[index] * factor(modelId, at) * (valid[index]! / VALID_KM2)));
  const thresholdCurve: AiCurve = times.map((time, index) => ({
    time: time.iso,
    points: curveThresholds(modelId).map((at) => ({ threshold: at, waterAreaKm2: area(index, at) })),
  }));
  const stats = times.map((time, index) => {
    const water = area(index, threshold);
    return { time: time.iso, waterAreaKm2: water, waterRatio: water == null ? null : round(water / valid[index]!, 4), validAreaKm2: valid[index] == null ? null : round(valid[index]!) };
  });
  const result: AiResult = { times: stats, thresholdCurve, threshold, modelId, metrics: null, researchBestThreshold: null };
  if (withGt) {
    const shift = Math.abs(threshold - 0.5);
    const overall = { iou: round(0.845 + shift * 0.06, 3), f1: round(0.916 + shift * 0.035, 3), precision: round(0.87 + shift * 0.1, 3), recall: round(0.97 - shift * 0.08, 3) };
    result.metrics = {
      overall,
      times: times.map((time, index) => ({ time: time.iso, ...overall, iou: round(overall.iou - (index % 3) * 0.012, 3) })).filter((_, index) => valid[index] != null),
    };
    result.researchBestThreshold = { threshold: 0.9, iou: 0.876, f1: 0.934 };
  }
  return result;
}

const ymd = (date = new Date()) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
const wait = (ms = 250) => new Promise((resolve) => window.setTimeout(resolve, ms));
const missingJob = () => Object.assign(new Error('작업을 찾을 수 없습니다.'), { status: 404 });

type DemoJob = AiWaterJob & { polls?: number };
const store: DemoJob[] = [];
let sequence = 0;
let seeded: Promise<void> | null = null;

/** The demo AI jobs; `datasets` supplies times and band lists. */
export function createAiDemo(loadDatasets: () => Promise<ZarrDataset[]>) {
  // One shared promise, so concurrent first calls (menu badge and page) all wait for the seed.
  const seed = () => (seeded ??= seedOnce());
  const seedOnce = async () => {
    const landsat = (await loadDatasets()).find((item) => item.id === 'landsat');
    if (!landsat) return;
    const input: AiJobRequest = { datacubeId: 'landsat', modelId: 'unet-s1s2-10ch', threshold: 0.5, name: `${landsat.name}_수체_U-Net (데모)` };
    store.push({
      id: 'ai-demo-1', type: 'AI_WATER', name: input.name!, status: 'SUCCEEDED', progress: 1, stage: 'register',
      createdAt: '2025-10-23T02:00:00Z', startedAt: '2025-10-23T02:00:04Z', finishedAt: '2025-10-23T02:01:12Z',
      registration: { datacubeId: 'landsat-infer-024', xcubeDatasetId: 'landsat_water_unet' },
      input, result: demoResult(landsat.times, input.modelId, 0.5, true),
    });
  };
  const advance = async (job: DemoJob) => {
    if (job.status !== 'RUNNING' && job.status !== 'QUEUED') return job;
    job.polls = (job.polls ?? 0) + 1;
    job.status = 'RUNNING';
    job.progress = Math.min(1, 0.15 + job.polls * 0.3);
    job.stage = job.progress < 0.5 ? 'prepare' : job.progress < 0.9 ? 'infer' : 'register';
    if (job.progress >= 1) {
      const datacubeId = String(job.input?.datacubeId ?? '');
      const dataset = (await loadDatasets()).find((item) => item.id === datacubeId);
      const all = dataset?.times ?? [];
      const from = job.input?.timeStart ? all.findIndex((time) => time.iso === job.input!.timeStart) : 0;
      const to = job.input?.timeEnd ? all.findIndex((time) => time.iso === job.input!.timeEnd) : all.length - 1;
      const times = all.slice(Math.max(0, from), to < 0 ? all.length : to + 1);
      const modelId = String(job.input?.modelId ?? '');
      const threshold = job.input?.threshold ?? DEMO_MODELS.find((model) => model.id === modelId)?.defaultThreshold ?? 0.5;
      Object.assign(job, {
        status: 'SUCCEEDED', progress: 1, finishedAt: new Date().toISOString(),
        registration: { datacubeId: `${datacubeId}-ai-${job.id}`, xcubeDatasetId: `${datacubeId}_water_${job.id}` },
        result: demoResult(times, modelId, threshold, bandsOf(dataset).includes('water_gt')),
      });
    }
    return job;
  };
  return {
    async models() { await wait(150); return DEMO_MODELS; },
    async check(datacubeId: string | number, modelId: string) {
      await wait(200);
      return checkDemo((await loadDatasets()).find((item) => item.id === String(datacubeId)), modelId);
    },
    async create(input: AiJobRequest): Promise<AiWaterJob> {
      await seed();
      await wait();
      const dataset = (await loadDatasets()).find((item) => item.id === String(input.datacubeId));
      const check = checkDemo(dataset, input.modelId);
      if (!check.ready) throw Object.assign(new Error(`필요한 입력이 없습니다: ${check.missing.join(', ')}`), { status: 409, code: 'AI_INPUT_MISSING' });
      const model = DEMO_MODELS.find((item) => item.id === input.modelId);
      const now = new Date().toISOString();
      const job: DemoJob = {
        id: `ai-${++sequence + 1}`, type: 'AI_WATER', status: 'QUEUED', progress: 0, stage: 'prepare', createdAt: now, startedAt: now,
        name: input.name || `${dataset?.name ?? input.datacubeId}_수체_${model?.name ?? input.modelId}_${ymd()} (데모)`, input,
      };
      store.unshift(job);
      return { ...job };
    },
    async list(filter: { status?: string; datacubeId?: string | number } = {}) {
      await seed();
      await wait(150);
      return store
        .filter((job) => (!filter.status || filter.status.split(',').includes(job.status)) && (filter.datacubeId == null || String(job.input?.datacubeId) === String(filter.datacubeId)))
        .map((job) => ({ ...job }));
    },
    async get(jobId: string) {
      await seed();
      await wait(150);
      const job = store.find((item) => item.id === jobId);
      if (!job) throw missingJob();
      return { ...(await advance(job)) };
    },
    async cancel(jobId: string) {
      await wait();
      const job = store.find((item) => item.id === jobId);
      if (job && (job.status === 'QUEUED' || job.status === 'RUNNING')) Object.assign(job, { status: 'CANCELLED', finishedAt: new Date().toISOString() });
    },
    async retry(jobId: string) {
      await wait();
      const job = store.find((item) => item.id === jobId);
      if (!job) throw missingJob();
      const again: DemoJob = { ...job, id: `ai-${++sequence + 1}`, status: 'QUEUED', progress: 0, polls: 0, errorCode: null, errorMessage: null, result: null, registration: null, createdAt: new Date().toISOString(), finishedAt: null };
      store.unshift(again);
      return { ...again };
    },
  };
}
