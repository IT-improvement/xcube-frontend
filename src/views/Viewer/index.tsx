import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Map from "ol/Map";
import OlMap from "../../components/map";
import addDynamicXcubeLayer from "../../components/xcubeLayer";
import { AiJob, Project, ZarrDataset } from "../../api/viewerAdapter";
import { activeViewerAdapter, useMockApi } from "../../api";
import { backofficeAdapter, SeriesPoint } from "../../api/backofficeApi";
import { userMessage } from "../../api/httpClient";
import { User } from "../../api/authApi";
import { toLonLat, transformExtent } from "ol/proj";
import { useTheme } from "../../hooks/useTheme";
import {
  ChartSpline,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  Crosshair,
  Hand,
  FileDown,
  GitCompareArrows,
  Layers,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  Scan,
  Waves,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import "./viewer.css";
import ViewerTour, { tourDismissed } from "./ViewerTour";
import ProjectQuickMenu from "./ProjectQuickMenu";
import { NEEDS, useRoleGate } from "../../auth/roles";
import { BottomGraphPanel, PixelMarker } from "./PixelGraph";
import DatasetPicker from "./DatasetPicker";
import LayerControl from "./LayerControl";
import PanelMore from "./PanelMore";
import SourceLegend, { swatchBackground } from "./SourceLegend";
import {
  CompareMap,
  CompareModes,
  CompareTarget,
  CompareTargetSwitch,
  CompareTime,
  DisplayMode,
  SwipeDivider,
  useCompareLayer,
} from "./CompareView";
import { ai, appApi, formatDate } from "../../app/api";
import { translate, useLanguage } from "../../i18n";
import type { Lang, TKey } from "../../i18n";
import "../../i18n/viewer";
import type { AiJobRequest, AiResult, AiWaterJob } from "../../api/aiApi";
import {
  AiLegend,
  aiMaskStyle,
  AiResultList,
  AiResultPanel,
  AiRunForm,
  entryDetail,
  isRunning,
  matchTime,
  ResultEntry,
  WaterAreaRow,
} from "./AiPanel";
import { PlaybackOptions, TimeStaff } from "./TimeStaff";
import UserMenu from "./UserMenu";
import { FrameBuffer, playbackInterval } from "./frameBuffer";
import { canShowRgb, defaultLayer, isAuxiliary, isLayerOf } from "./defaultLayer";
import AreaStatsPanel from "./AreaStatsPanel";
import type { AreaTarget } from "./AreaStatsPanel";
import ExportPanel from "./ExportPanel";
import { matchTimeIndex } from "./timeMatch";
import type { ExportTarget } from "./ExportPanel";
import { CompareEntry, ComparisonLegend, ComparisonPanel } from "./ComparisonPanel";
import { useAreaDraw } from "./areaDraw";
import { colorBarPreviews, rampStops, rgbMapping, legendValue, categoriesOf } from "./SourceLegend";
import { metersPerPixel, niceScale, pngFileName, settled, sheetPng, snapshotMap } from "./mapPng";
import type { LegendSpec } from "./mapPng";
import { comparisonForDataset, comparisonInfo, comparisonStyle, comparisonTypeFromColorBar, COMPARISON_CLASSES } from "../../api/compare";
import { setAreaStatsDemoContext } from "../../api/areaStats";
import { comparisonViewerHref, originComparisonsApi } from "../../api/originComparisons";
import type { OriginComparison } from "../../api/originComparisons";
import { ComparisonBanner, ComparisonGroup, ComparisonMapLegend, markComparisonsSeen, seenComparisons } from "./ComparisonList";
import { exportsApi, saveBlob } from "../../api/exports";
import { Dialog } from "../../components/ui/kit";
import { Button } from "../../components/ui";

/** The one tool panel on the right (UX2): its tabs are the tool rail's buttons. */
type Tool = "layers" | "area" | "ai" | "result" | "export";
const TOOLS: Tool[] = ["layers", "area", "ai", "result", "export"];
const TOOL_ICON = { layers: Layers, area: ChartSpline, ai: Waves, result: GitCompareArrows, export: FileDown } as const;
type Drawer = Tool | null;
const loadImage = (src: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
/** A CSS colour token's value (OpenLayers styles need the colour itself). */
const cssColor = (name: string, fallback: string) => {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch {
    return fallback;
  }
};
/** A passing notice over the map: a tile failure, a request failure, or a fixed sentence. */
type ViewerNotice = { tile?: boolean; cause?: unknown; key?: TKey };
function noticeText(notice: ViewerNotice, lang: Lang) {
  if (notice.key) return translate(lang, notice.key);
  const error = userMessage(notice.cause, lang);
  return notice.tile ? translate(lang, "viewer.toast.tileFailed", { error }) : error;
}
type MapTool = "pan" | "pixel";
const noop = () => undefined;
/** Numeric catalog ids go to the services as numbers; demo ids stay strings. */
const cubeId = (id: string) => (/^\d+$/.test(id) ? Number(id) : id);

/**
 * AI service jobs first; Backoffice links only when no job already points at them. The links cover older results and
 * results the AI service does not list for this user, such as the example AI result of an example source (UX1): its
 * job belongs to another account. They carry the result's own name from the dataset detail.
 */
function resultEntries(aiJobs: AiWaterJob[], linked: AiJob[], lang: Lang, linkedInfo: Record<string, AiWaterJob | null> = {}): ResultEntry[] {
  const entries: ResultEntry[] = aiJobs.map((job) => ({
    key: job.id,
    name: job.name,
    status: job.status,
    job,
    datacubeId: job.registration?.datacubeId != null ? String(job.registration.datacubeId) : undefined,
    xcubeDatasetId: job.registration?.xcubeDatasetId,
    modelId: job.input?.modelId ? String(job.input.modelId) : undefined,
    threshold: typeof job.input?.threshold === "number" ? job.input.threshold : job.result?.threshold,
    createdAt: job.createdAt,
    timeStart: job.result?.times?.[0]?.time ?? (typeof job.input?.timeStart === "string" ? job.input.timeStart : undefined),
    timeEnd: job.result?.times?.length ? job.result.times[job.result.times.length - 1].time : typeof job.input?.timeEnd === "string" ? job.input.timeEnd : undefined,
  }));
  for (const link of linked)
    if (link.outputDatacubeId && !entries.some((entry) => entry.datacubeId === link.outputDatacubeId)) {
      // FIX2: the AI service answers readers of a result with its public statistics (model, threshold, period).
      const info = linkedInfo[link.outputDatacubeId];
      entries.push({
        key: `link:${link.outputDatacubeId}`,
        name: link.name || translate(lang, "viewer.ai.list.linkedName", { id: link.id }),
        status: link.status,
        datacubeId: link.outputDatacubeId,
        ...(info ? {
          modelId: info.input?.modelId ? String(info.input.modelId) : info.result?.modelId,
          threshold: typeof info.input?.threshold === "number" ? info.input.threshold : info.result?.threshold,
          createdAt: info.createdAt,
          timeStart: info.result?.times?.[0]?.time,
          timeEnd: info.result?.times?.length ? info.result.times[info.result.times.length - 1].time : undefined,
        } : {}),
      });
    }
  return entries;
}

/** Viewer state kept in the address so a view can be reloaded or shared (M5). */
type UrlState = {
  dataset?: string;
  project?: string;
  variable?: string;
  time?: string;
  mode?: DisplayMode;
  compare?: string;
  /** Compare target "ai" (원본 ↔ AI 결과). */
  target?: CompareTarget;
  /** AI result to show: AI job id or result datacube id. */
  ai?: string;
  /** Tool panel to open (CMP2: `result`). */
  tool?: string;
  /** Comparison result (COMPARISON id) to show on the map in 결과 비교 (CMP2). */
  comparison?: string;
};
const VIEWER_PATH = "/app/viewer";
function readUrlState(): UrlState {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  return {
    dataset: params.get("dataset") ?? undefined,
    project: params.get("project") ?? undefined,
    variable: params.get("var") ?? undefined,
    time: params.get("t") ?? undefined,
    mode: mode === "swipe" || mode === "split" ? mode : undefined,
    compare: params.get("b") ?? undefined,
    target: params.get("cmp") === "ai" ? "ai" : undefined,
    ai: params.get("ai") ?? undefined,
    tool: params.get("tool") ?? undefined,
    comparison: params.get("comparison") ?? undefined,
  };
}
/** Keys typed into fields, buttons and dialogs keep their own meaning. */
function ownsKeys(target: EventTarget | null, key: string) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const fields = "input, textarea, select, [role='slider'], [role='combobox'], [role='listbox'], [role='dialog'], [role='alertdialog'], [role='menu'], [role='tablist'], [role='application']";
  return !!target.closest(key === " " ? `${fields}, button, a, summary` : fields);
}

/** How often and how long the Viewer asks whether a new AI result is on the map yet (pod restart, FR-AI). */
const RESULT_PUBLISH_POLL_MS = 3000;
/** A frame that takes longer than this to draw shows "불러오는 중…" (Loading…) beside the date. */
const FRAME_WAIT_DELAY_MS = 150;
const RESULT_PUBLISH_WAIT_MS = 4 * 60 * 1000;

export default function Viewer({
  user,
  onLogout = noop,
  onboarding = false,
  initialDatasetId,
}: {
  user?: User;
  onLogout?: () => void;
  /** Show the feature tour on entry unless the user chose "다시 보지 않기". */
  onboarding?: boolean;
  /** Dataset to select once the list loads (/app/viewer?dataset=…). */
  initialDatasetId?: string;
}) {
  const { theme, toggle: toggleTheme } = useTheme();
  const { lang, t } = useLanguage();
  // UR-59: adding data and running AI need PROJECT_USER; below that they stay, off, with the reason.
  const addLocked = useRoleGate().reason(NEEDS.createData);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [datasets, setDatasets] = useState<ZarrDataset[]>([]);
  const [projectDatasets, setProjectDatasets] = useState<ZarrDataset[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [flash, setFlash] = useState("");
  const [notice, setNotice] = useState("");
  const [noDataHidden, setNoDataHidden] = useState(false);
  const [pickHintHidden, setPickHintHidden] = useState(false);
  const [tourOpen, setTourOpen] = useState(
    () => onboarding && !tourDismissed(),
  );
  // UX2: the tool panel starts closed; the rail on the right names every tool.
  const [drawer, setDrawer] = useState<Drawer>(null);
  /** Tools opened once stay mounted (hidden) so a running area query or export keeps going across tabs. */
  const [visited, setVisited] = useState<Tool[]>([]);
  /** VX1: on phones the tool sheet sits half-way (map still visible) or full; a press switches. */
  const [sheetFull, setSheetFull] = useState(false);
  /** VX1: a rail tool that cannot be used says why, next to the rail, with the next step. */
  const [railTip, setRailTip] = useState<{ tool: Tool; reason: string } | null>(null);
  const [baseVisible, setBaseVisible] = useState(true);
  const [sourceVisible, setSourceVisible] = useState(true);
  const [resultVisible, setResultVisible] = useState(false);
  const [sourceOpacity, setSourceOpacity] = useState(100);
  const [resultOpacity, setResultOpacity] = useState(90);
  const [timeIndex, setTimeIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const [pixel, setPixel] = useState<[number, number] | null>(null);
  const [jobs, setJobs] = useState<AiJob[]>([]);
  // M7: AI jobs of the shown dataset, the selected result and the latest run.
  const [aiJobs, setAiJobs] = useState<AiWaterJob[]>([]);
  const [aiTick, setAiTick] = useState(0);
  /** FIX2: AI job info of linked results (by result datacube id); null once asked and not available. */
  const [linkedInfo, setLinkedInfo] = useState<Record<string, AiWaterJob | null>>({});
  const [resultKey, setResultKey] = useState("");
  /** Result datacube of the chosen result, so a link entry replaced by its job entry stays chosen. */
  const resultCubeRef = useRef<string | undefined>(undefined);
  // A comparison asked for in the address (CMP2) wins over the AI layer, so its `ai` does not turn that layer on.
  const wantedResultRef = useRef<string | undefined>(
    new URLSearchParams(window.location.search).get("comparison") ? undefined : new URLSearchParams(window.location.search).get("ai") ?? undefined,
  );
  const [resultStats, setResultStats] = useState<AiResult | null>(null);
  const [resultStatsLoading, setResultStatsLoading] = useState(false);
  const [resultCube, setResultCube] = useState<ZarrDataset | null>(null);
  const [aiRun, setAiRun] = useState<AiWaterJob | null>(null);
  const [aiRunFailure, setAiRunError] = useState<unknown>(null);
  const aiRunError = aiRunFailure ? userMessage(aiRunFailure, lang) : "";
  const [compareTarget, setCompareTarget] = useState<CompareTarget>("time");
  const [areaExpanded, setAreaExpanded] = useState(true);
  const [map, setMap] = useState<Map | null>(null);
  const [loading, setLoading] = useState(true);
  // Request failures keep their cause and are worded when drawn, so a language switch rewords them.
  const [apiFailure, setApiFailure] = useState<unknown>(null);
  const apiError = apiFailure ? userMessage(apiFailure, lang) : "";
  const [noticeState, setViewerNotice] = useState<ViewerNotice | null>(null);
  const viewerNotice = noticeState ? noticeText(noticeState, lang) : "";
  const [seriesPoints, setSeriesPoints] = useState<SeriesPoint[]>([]);
  const [pixelLonLat, setPixelLonLat] = useState<{
    lon: number;
    lat: number;
  } | null>(null);
  const [activeVariable, setActiveVariable] = useState("");
  /** True while the shown layer is the default-layer rule's choice; a band the user picks turns it off. */
  const layerAutoRef = useRef(true);
  const chooseLayer = useCallback((layer: string) => {
    layerAutoRef.current = false;
    setActiveVariable(layer);
  }, []);
  const [xcubeConnected, setXcubeConnected] = useState<boolean | null>(null);
  const [jobsFailure, setJobsError] = useState<unknown>(null);
  const jobsError = jobsFailure ? userMessage(jobsFailure, lang) : "";
  const [mapTool, setMapTool] = useState<MapTool>("pan");
  const [pixelTip, setPixelTip] = useState(false);
  const [graphExpanded, setGraphExpanded] = useState(true);
  const [pickerRequest, setPickerRequest] = useState(0);
  // Keyboard pixel query: a reticle moved with the arrow keys, queried with Enter.
  const mapBoxRef = useRef<HTMLElement>(null);
  const aiStartingRef = useRef(false);
  const [aiStarting, setAiStarting] = useState(false);
  const probeRef = useRef<HTMLButtonElement>(null);
  const focusProbeRef = useRef(false);
  const [probe, setProbe] = useState<[number, number] | null>(null);
  const urlStateRef = useRef<UrlState>(readUrlState());
  const [displayMode, setDisplayMode] = useState<DisplayMode>("single");
  const [compareIndex, setCompareIndex] = useState(-1);
  const [swipe, setSwipe] = useState(50);
  const swipeRef = useRef(50);
  const [compareMap, setCompareMap] = useState<Map | null>(null);
  const frameBuffer = useRef<FrameBuffer | null>(null);
  const [shownTileUrl, setShownTileUrl] = useState<string | null>(null);
  const [frameDue, setFrameDue] = useState(false);
  const shownDatasetRef = useRef<string | undefined>(undefined);
  const sourceVisibleRef = useRef(sourceVisible);
  const sourceOpacityRef = useRef(sourceOpacity);
  sourceVisibleRef.current = sourceVisible;
  sourceOpacityRef.current = sourceOpacity;
  const detailLoadedRef = useRef("");
  /** The dataset whose detail (full time list) has arrived or failed; the address's times wait for it. */
  const [detailReadyId, setDetailReadyId] = useState("");
  const initialAppliedRef = useRef(false);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const selected = datasets.find((item) => item.id === datasetId) ?? null;
  const selectedId = selected?.id;
  const selectedXcubeDatasetId = selected?.xcubeDatasetId;
  const selectedBbox = selected?.bbox;
  const selectedBboxRef = useRef(selectedBbox);
  selectedBboxRef.current = selectedBbox;
  const selectedTileBase = selected?.tileBaseUrl;
  // Colour bar and value range of the shown variable (raw values need their real range, M1/M2).
  const variableStyle = activeVariable && activeVariable !== "rgb" ? selected?.variableMetadata?.[activeVariable] : undefined;
  const styleKey = variableStyle?.colorBarName || variableStyle?.colorBarMin != null ? `${variableStyle?.colorBarName}|${variableStyle?.colorBarMin}|${variableStyle?.colorBarMax}` : "";
  const catalogStyle = useMemo(() => {
    if (!styleKey) return undefined;
    const [cmap, vmin, vmax] = styleKey.split("|");
    return { cmap: cmap && cmap !== "undefined" ? cmap : undefined, vmin: vmin === "undefined" ? undefined : Number(vmin), vmax: vmax === "undefined" ? undefined : Number(vmax) };
  }, [styleKey]);
  // A comparison result (UR-63 F3) is drawn with the contract's class colours, the same ones its legend shows.
  // Its metrics come from the dataset's metadata when Backoffice shows it, else from the compare job that made it.
  const [jobComparison, setJobComparison] = useState<{ id: string; value: Record<string, unknown> | null } | null>(null);
  const needsJobComparison = selected?.kind === "COMPARISON" && !selected.comparison && !useMockApi ? selected.id : "";
  useEffect(() => {
    if (!needsJobComparison) return;
    let alive = true;
    comparisonForDataset(needsJobComparison)
      .then((value) => alive && setJobComparison({ id: needsJobComparison, value }))
      .catch(() => alive && setJobComparison({ id: needsJobComparison, value: null }));
    return () => {
      alive = false;
    };
  }, [needsJobComparison]);
  const classColorBar = selected?.kind === "COMPARISON" ? selected.variableMetadata?.class?.colorBarName : undefined;
  const comparison = useMemo(() => {
    if (selected?.kind !== "COMPARISON") return null;
    const recorded = selected.comparison ?? (jobComparison?.id === selected.id ? jobComparison.value : null);
    const info = comparisonInfo(recorded);
    return info.type ? info : { ...info, type: comparisonTypeFromColorBar(classColorBar) };
  }, [selected?.kind, selected?.comparison, selected?.id, jobComparison, classColorBar]);
  const comparisonType = comparison?.type ?? null;
  const showsClasses = !!comparison && activeVariable === "class";
  const tileStyle = useMemo(
    () => (showsClasses && comparisonType ? comparisonStyle(comparisonType) : catalogStyle),
    [showsClasses, comparisonType, catalogStyle],
  );
  const entries = useMemo(
    () =>
      resultEntries(
        aiJobs,
        jobs.filter(
          (job) =>
            job.inputDatacubeId === selected?.id &&
            job.status === "SUCCEEDED" &&
            (job.outputType === "AI_RESULT" || job.outputType === "INFER_ZARR"),
        ),
        lang,
        linkedInfo,
      ),
    [aiJobs, jobs, selected?.id, lang, linkedInfo],
  );
  const readyEntries = useMemo(
    () => entries.filter((entry) => entry.status === "SUCCEEDED" && (!!entry.datacubeId || !!entry.job?.result)),
    [entries],
  );
  // A link entry replaced by the AI job of the same result is still the chosen result while the key catches up
  // (FIX2: otherwise one render without a result drops a one-time 원본 ↔ AI comparison back to 단일).
  const selectedResult =
    readyEntries.find((entry) => entry.key === resultKey) ??
    (resultKey.startsWith("link:") ? readyEntries.find((entry) => entry.datacubeId === resultKey.slice(5)) : undefined) ??
    null;
  const hasInference = !!selected && readyEntries.length > 0;
  // ── CMP2 (UR-64): comparison results of the shown original, listed in 결과 비교 next to the AI results ──
  // `items` undefined while loading, null when they cannot be read (Backoffice without the API yet): AI results only.
  const [comparisons, setComparisons] = useState<{ originId: string; items: OriginComparison[] | null } | null>(null);
  const [comparisonTick, setComparisonTick] = useState(0);
  const deletedComparisonsRef = useRef(new Set<string>());
  const comparisonOrigin = selected && selected.kind !== "AI_RESULT" && selected.kind !== "COMPARISON" ? selected.id : "";
  useEffect(() => {
    if (!comparisonOrigin) {
      setComparisons(null);
      return;
    }
    const controller = new AbortController();
    originComparisonsApi.list(comparisonOrigin, controller.signal).then((items) => {
      // An answer that left before a delete here still lists the deleted one: drop it.
      if (!controller.signal.aborted) setComparisons({ originId: comparisonOrigin, items: items && items.filter((item) => !deletedComparisonsRef.current.has(item.id)) });
    });
    return () => controller.abort();
  }, [comparisonOrigin, comparisonTick]);
  const comparisonItems = comparisonOrigin && comparisons?.originId === comparisonOrigin ? comparisons.items : undefined;
  const comparisonList = useMemo(() => comparisonItems ?? [], [comparisonItems]);
  /** The one comparison on the map (never together with the AI water layer or a swipe/split comparison). */
  const [shownComparisonId, setShownComparisonId] = useState<string | null>(null);
  const shownComparisonRef = useRef(shownComparisonId);
  shownComparisonRef.current = shownComparisonId;
  const shownComparison = shownComparisonId ? comparisonList.find((item) => item.id === shownComparisonId) ?? null : null;
  const [comparisonNews, setComparisonNews] = useState("");
  const showComparison = useCallback(
    (item: OriginComparison | null, announce = true) => {
      setShownComparisonId(item?.id ?? null);
      if (item) {
        setResultVisible(false);
        setDisplayMode("single");
        setCompareTarget((target) => (target === "ai" ? "time" : target));
      }
      if (announce) setComparisonNews(item ? t("viewer.cmps.announceOn", { name: item.name }) : t("viewer.cmps.announceOff"));
    },
    [t],
  );
  // Turning the AI layer on or starting swipe/side by side takes the comparison off the map (one thing at a time).
  const conflictRef = useRef({ resultVisible, displayMode });
  useEffect(() => {
    const before = conflictRef.current;
    conflictRef.current = { resultVisible, displayMode };
    if (!shownComparisonId) return;
    if ((resultVisible && !before.resultVisible) || (displayMode !== "single" && before.displayMode === "single")) showComparison(null);
  }, [resultVisible, displayMode, shownComparisonId, showComparison]);
  // A comparison that left the list (deleted elsewhere) leaves the map too.
  useEffect(() => {
    if (shownComparisonId && comparisonItems !== undefined && !shownComparison) setShownComparisonId(null);
  }, [shownComparisonId, comparisonItems, shownComparison]);
  // "새 결과" dot on the rail: comparisons this browser has not listed yet.
  const [seenIds, setSeenIds] = useState<Set<string>>(() => seenComparisons());
  const hasNewComparison = comparisonList.some((item) => !seenIds.has(item.id));
  /** Opened from the address without a comparison: the AI layer comes on once the AI results are known (as the rail does). */
  const wantAiLayerRef = useRef(false);
  // Time labels come from the catalogue in Korean form (2024. 8. 14.); other languages re-label from the ISO time.
  const times = useMemo(
    () => (lang === "ko" ? selected?.times ?? [] : (selected?.times ?? []).map((time) => (Number.isFinite(Date.parse(time.iso)) ? { ...time, label: formatDate(time.iso, lang) } : time))),
    [selected, lang],
  );
  const aiRunHere = aiRun && String(aiRun.input?.datacubeId ?? "") === selected?.id ? aiRun : null;
  // 원본 ↔ AI 결과 at the same time replaces time B while a result is chosen.
  // Comparing with an AI result needs only one time; comparing times needs two.
  const canCompare = times.length > 1 || !!selectedResult;
  const aiCompare =
    !!selected && displayMode !== "single" && compareTarget === "ai" && !!selectedResult;
  const hasRgb = useMemo(() => canShowRgb(selected), [selected]);
  // Bands of the RGB composite (xcube rgbSchema), or the red/green/blue variables it is built from.
  const rgbBands = useMemo(() => {
    if (selected?.rgbBands?.length === 3) return selected.rgbBands;
    const named = ["red", "green", "blue"].map((band) => selected?.variables.find((variable) => variable.toLowerCase() === band));
    return named.every(Boolean) ? (named as string[]) : undefined;
  }, [selected]);
  const fail = useCallback(
    (cause: unknown) => {
      setApiFailure(cause ?? new Error());
    },
    [],
  );
  const tileFailRef = useRef((cause: unknown) => setViewerNotice({ tile: true, cause }));
  const loadProjects = useCallback(() => {
    setLoading(true);
    setApiFailure(null);
    activeViewerAdapter
      .getProjects()
      .then((items) => {
        setProjects(items);
        setProjectId((current) =>
          current && items.some((item) => item.id === current) ? current : "",
        );
      })
      .catch(fail)
      .finally(() => setLoading(false));
  }, [fail]);
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);
  useEffect(() => {
    if (useMockApi) {
      setXcubeConnected(true);
      return;
    }
    backofficeAdapter.checkXcubeStatus().then(setXcubeConnected);
  }, []);
  // The signed-in user's personal xcube pod (M2): poll while it is starting.
  const [podState, setPodState] = useState<string | null>(null);
  useEffect(() => {
    if (useMockApi || typeof backofficeAdapter.getMyXcubeInstance !== "function") return;
    let cancelled = false;
    let timer: number | undefined;
    const check = () =>
      Promise.resolve(backofficeAdapter.getMyXcubeInstance())
        .then((instance) => {
          if (cancelled || !instance?.enabled) return;
          setPodState(instance.state);
          if (instance.state === "STARTING") timer = window.setTimeout(check, 5000);
        })
        .catch(() => undefined);
    check();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    setDatasetId("");
    setPixel(null);
    setPlaying(false);
    setLoading(true);
    activeViewerAdapter
      .getDatasets()
      .then(setDatasets)
      .catch(fail)
      .finally(() => setLoading(false));
  }, [fail]);
  // The "no Zarr yet" card is a hint, not an error: show it briefly.
  const noData = !loading && !apiError && datasets.length === 0;
  useEffect(() => {
    if (!noData) {
      setNoDataHidden(false);
      return;
    }
    const timer = window.setTimeout(() => setNoDataHidden(true), 3500);
    return () => window.clearTimeout(timer);
  }, [noData]);
  // The "pick a dataset" card is a first-glance hint: it leaves after 5 s; the picker stays in the top bar.
  // Count only while the card is actually on screen (not behind the entry tour).
  const pickHintCandidate = !datasetId && !loading && !apiError && datasets.length > 0 && !tourOpen;
  useEffect(() => {
    if (!pickHintCandidate) return;
    const timer = window.setTimeout(() => setPickHintHidden(true), 3000);
    return () => window.clearTimeout(timer);
  }, [pickHintCandidate]);
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(""), 3200);
    return () => window.clearTimeout(timer);
  }, [flash]);
  // Data added or projects changed in another tab show up when the user comes
  // back. Already loaded dataset details are kept so the map does not reload.
  const lastRefreshRef = useRef(0);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefreshRef.current < 5000) return;
      lastRefreshRef.current = Date.now();
      activeViewerAdapter
        .getProjects()
        .then((items) => {
          setProjects(items);
          setProjectId((current) =>
            current && items.some((item) => item.id === current) ? current : "",
          );
        })
        .catch(() => undefined);
      activeViewerAdapter
        .getDatasets()
        .then((items) =>
          setDatasets((current) => {
            const next = items.map((item) => current.find((known) => known.id === item.id) ?? item);
            // A comparison opened from an old link (original unknown) is not listed; it stays while shown.
            return [...next, ...current.filter((known) => known.kind === "COMPARISON" && !next.some((item) => item.id === known.id))];
          }),
        )
        .catch(() => undefined);
      const currentProject = projectIdRef.current;
      if (currentProject && activeViewerAdapter.getProjectDatasets)
        activeViewerAdapter
          .getProjectDatasets(currentProject)
          .then(setProjectDatasets)
          .catch(() => undefined);
    };
    lastRefreshRef.current = Date.now();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  useEffect(() => {
    if (!projectId || !activeViewerAdapter.getProjectDatasets) {
      setProjectDatasets([]);
      return;
    }
    activeViewerAdapter
      .getProjectDatasets(projectId)
      .then(setProjectDatasets)
      .catch(fail);
  }, [projectId, fail]);
  useEffect(() => {
    if (!datasetId) {
      setJobs([]);
      setJobsError(null);
      return;
    }
    setJobsError(null);
    activeViewerAdapter
      .getJobs(datasetId)
      .then(setJobs)
      .catch((cause) => {
        setJobs([]);
        setJobsError(cause ?? new Error());
      });
  }, [datasetId, aiTick]);
  // AI service jobs of this dataset. The service may not be up yet: then only Backoffice links show.
  useEffect(() => {
    setAiJobs([]);
    if (!datasetId) return;
    let cancelled = false;
    ai.listJobs({ datacubeId: datasetId })
      .then((items) => !cancelled && setAiJobs(items))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [datasetId, aiTick]);
  // Keep the chosen result while it exists; otherwise the one asked for (address, finished run), else the newest.
  useEffect(() => {
    const wanted = wantedResultRef.current;
    const match = wanted ? readyEntries.find((entry) => entry.key === wanted || entry.datacubeId === wanted) : undefined;
    if (match) {
      wantedResultRef.current = undefined;
      setResultKey(match.key);
      setResultVisible(true);
      return;
    }
    setResultKey((current) => {
      if (readyEntries.some((entry) => entry.key === current)) return current;
      // A Backoffice link replaced by the AI job of the same result (or the reverse) stays the chosen result.
      const cube = current.startsWith("link:") ? current.slice(5) : resultCubeRef.current;
      const same = cube ? readyEntries.find((entry) => entry.datacubeId === cube) : undefined;
      return same?.key ?? readyEntries[0]?.key ?? "";
    });
  }, [readyEntries]);
  const selectedResultKey = selectedResult?.key;
  const selectedResultJob = selectedResult?.job;
  resultCubeRef.current = selectedResult?.datacubeId;
  // FIX2: a linked result (no AI job of this user) asks the AI service by result id once; readers get its statistics.
  const askedInfoRef = useRef(new Set<string>());
  // Answers are kept even when the list changed meanwhile (each result is asked only once).
  useEffect(() => {
    for (const entry of entries) {
      const cube = entry.datacubeId;
      if (entry.job || !cube || askedInfoRef.current.has(cube)) continue;
      askedInfoRef.current.add(cube);
      // Deferred so an older AI service (no lookup) or a missing method only means "no statistics".
      Promise.resolve()
        .then(() => ai.getResult(cube))
        .then((job) => setLinkedInfo((current) => ({ ...current, [cube]: job })))
        .catch(() => setLinkedInfo((current) => ({ ...current, [cube]: null })));
    }
  }, [entries]);
  const linkedStats = !selectedResultJob && selectedResult?.datacubeId ? linkedInfo[selectedResult.datacubeId]?.result ?? null : null;
  useEffect(() => {
    setResultStats(selectedResultJob?.result ?? linkedStats);
    setResultStatsLoading(false);
    if (!selectedResultKey || !selectedResultJob || selectedResultJob.result) return;
    let cancelled = false;
    setResultStatsLoading(true);
    ai.getJob(selectedResultKey)
      .then((job) => !cancelled && setResultStats(job.result ?? null))
      .catch(() => undefined)
      .finally(() => !cancelled && setResultStatsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedResultKey, selectedResultJob, linkedStats]);
  // The result dataset's own xcube id and server (owner pod) for its tiles, as for the main layer.
  const resultCubeId = selectedResult?.datacubeId;
  // A finished AI result is registered, then the owner's xcube pod restarts to serve it (10–60 s measured).
  // Until the catalogue says AVAILABLE no tile is requested; the legend says it is being put on the map.
  useEffect(() => {
    setResultCube(null);
    if (!resultCubeId || useMockApi) return;
    let cancelled = false;
    let timer: number | undefined;
    const started = Date.now();
    const load = () =>
      backofficeAdapter
        .getDatasetDetail(resultCubeId)
        .then((detail) => {
          if (cancelled) return;
          setResultCube(detail);
          if (detail.availability && detail.availability !== "AVAILABLE" && Date.now() - started < RESULT_PUBLISH_WAIT_MS)
            timer = window.setTimeout(load, RESULT_PUBLISH_POLL_MS);
        })
        .catch(() => undefined);
    load();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [resultCubeId]);
  // Shown as "지도에 올리는 중" once the catalogue says not yet; tiles also wait while the detail loads, so a new
  // result is never asked from a server that does not have it (the main 8080 before the owner's pod is known).
  const resultPublishing = !useMockApi && !!resultCube && !!resultCube.availability && resultCube.availability !== "AVAILABLE";
  const resultTilesWait = resultPublishing || (!useMockApi && !!resultCubeId && !resultCube);
  // Follow a run until it ends; a finished run becomes the shown result.
  useEffect(() => {
    if (!aiRun || !isRunning(aiRun)) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      ai.getJob(aiRun.id)
        .then((job) => {
          if (cancelled) return;
          setAiRun(job);
          if (isRunning(job)) return;
          if (job.status === "SUCCEEDED") {
            wantedResultRef.current = job.id;
            setFlash(t("viewer.toast.aiDone"));
          }
          setAiTick((value) => value + 1);
        })
        .catch((cause) => !cancelled && setAiRunError(cause ?? new Error()));
    }, useMockApi ? 700 : 3000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // t only words the toast; a language switch must not restart the poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiRun]);
  const datasetsRef = useRef(datasets);
  datasetsRef.current = datasets;
  const resolvingRef = useRef(false);
  const [, setInitialResolved] = useState(false);
  useEffect(() => {
    // Preselect the dataset passed in the URL once, after the list arrives.
    if (initialAppliedRef.current || !initialDatasetId || !datasets.length) return;
    if (datasets.some((item) => item.id === initialDatasetId && item.kind !== "COMPARISON")) {
      initialAppliedRef.current = true;
      setDatasetId(initialDatasetId);
      return;
    }
    // CMP2: comparison results are not listed. An old link `?dataset={comparison}` becomes the original's 결과 비교
    // with that comparison on the map (address replaced); when the original is unknown it opens as data, as before.
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    const finish = (id?: string) => {
      initialAppliedRef.current = true;
      if (id) setDatasetId(id);
      setInitialResolved(true);
    };
    const ensure = async (id: string) => {
      if (datasetsRef.current.some((item) => item.id === id)) return true;
      try {
        const detail = await originComparisonsApi.detail(id);
        setDatasets((current) => (current.some((item) => item.id === id) ? current : [...current, detail]));
        return true;
      } catch {
        return false;
      }
    };
    (async () => {
      let detail: ZarrDataset;
      try {
        detail = await originComparisonsApi.detail(initialDatasetId);
      } catch {
        finish();
        return;
      }
      if (detail.kind !== "COMPARISON") {
        // Not in the list (e.g. not readable as a list item): nothing is chosen, as before.
        finish();
        return;
      }
      const origin = await originComparisonsApi.originOf(detail);
      if (origin && (await ensure(origin))) {
        window.history.replaceState(window.history.state, "", comparisonViewerHref(origin, detail.id));
        urlStateRef.current = { dataset: origin, tool: "result", comparison: detail.id };
        wantedResultRef.current = undefined;
        finish(origin);
        return;
      }
      setDatasets((current) => (current.some((item) => item.id === detail.id) ? current : [...current, detail]));
      finish(detail.id);
    })();
  }, [datasets, initialDatasetId]);
  /** FIX4: each pixel query counts up; an answer for an older query (another dataset, band or pixel) is dropped. */
  const pixelRunRef = useRef(0);
  const prevDatasetRef = useRef("");
  useEffect(() => {
    setTimeIndex(0);
    pixelRunRef.current += 1;
    setPixel(null);
    setPixelLonLat(null);
    setSeriesPoints([]);
    setPlaying(false);
    setActiveVariable("");
    layerAutoRef.current = true; // a new dataset opens with the default-layer rule
    detailLoadedRef.current = "";
    setCompareIndex(-1);
    // CMP2: a comparison belongs to its original; another dataset takes it (and its banner and legend) away.
    setShownComparisonId(null);
    wantAiLayerRef.current = false;
    // UXF1 (FIX4 §4.2): another dataset starts with its AI water layer off, unless 결과 비교 is open (that panel is
    // the switch for seeing AI results, so the new data's result shows there as before).
    if (prevDatasetRef.current && prevDatasetRef.current !== datasetId && drawerRef.current !== "result") setResultVisible(false);
    prevDatasetRef.current = datasetId;
    if (urlStateRef.current.dataset && urlStateRef.current.dataset !== datasetId && datasetId)
      urlStateRef.current = {}; // the user picked another dataset: the address no longer applies
  }, [datasetId]);
  // Restore project, variable, times and display mode from the address once their lists are known.
  useEffect(() => {
    const pending = urlStateRef.current;
    if (!pending.project || !projects.length) return;
    if (projects.some((item) => item.id === pending.project)) setProjectId(pending.project);
    urlStateRef.current = { ...urlStateRef.current, project: undefined };
  }, [projects]);
  useEffect(() => {
    const pending = urlStateRef.current;
    if (!selected || pending.dataset !== selected.id) return;
    const next = { ...pending };
    if (times.length) {
      const a = matchTimeIndex(times, pending.time);
      const b = matchTimeIndex(times, pending.compare);
      // UXF1: the catalogue lists only the first and last time; a middle `t=` waits for the detail's full list
      // (it used to be dropped at that first look, so the Viewer opened on the first time).
      if (((pending.time && a < 0) || (pending.compare && b < 0)) && detailReadyId !== selected.id) return;
      if (a >= 0) setTimeIndex(a);
      // FIX2: 원본 ↔ AI 결과 needs the result chosen; with one time the comparison would otherwise fall back to
      // 단일 before the AI list arrives, so the mode waits (in the address state) until the asked result is there.
      const waitForResult = !!pending.mode && pending.target === "ai" && !selectedResult;
      if (pending.mode && !waitForResult && (times.length > 1 || pending.target === "ai")) {
        setDisplayMode(pending.mode);
        setCompareIndex(b >= 0 ? b : a > 0 ? a - 1 : 1);
        if (pending.target === "ai") setCompareTarget("ai");
      }
      next.time = undefined;
      if (!waitForResult) next.compare = next.mode = next.target = undefined;
    }
    urlStateRef.current = next;
  }, [selected, times, selectedResult, detailReadyId]);
  // Layer a dataset opens with (FB1 §1): `?var=` > RGB > first band, re-applied while the layer is still the
  // rule's choice (the catalog entry may learn its RGB bands from the detail), never over a band the user picked.
  useEffect(() => {
    if (!selected || (!selected.variables.length && !canShowRgb(selected))) return;
    const pending = urlStateRef.current;
    if (pending.dataset === selected.id && pending.variable) {
      urlStateRef.current = { ...urlStateRef.current, variable: undefined };
      if (isLayerOf(selected, pending.variable)) {
        layerAutoRef.current = false;
        setActiveVariable(pending.variable);
        return;
      }
    }
    if (!layerAutoRef.current) return;
    const layer = defaultLayer(selected);
    setActiveVariable((current) => (current === layer ? current : layer));
  }, [selected]);
  useEffect(() => {
    if (!window.location.pathname.startsWith(VIEWER_PATH)) return;
    if (loading || (initialDatasetId && !initialAppliedRef.current)) return;
    const params = new URLSearchParams();
    if (datasetId) params.set("dataset", datasetId);
    if (projectId) params.set("project", projectId);
    if (datasetId && activeVariable) params.set("var", activeVariable);
    if (datasetId && times[timeIndex]) params.set("t", times[timeIndex].iso);
    if (datasetId && displayMode !== "single") {
      params.set("mode", displayMode);
      if (aiCompare) params.set("cmp", "ai");
      else if (times[compareIndex]) params.set("b", times[compareIndex].iso);
    }
    // The result's datacube id when known (same for owner and reader, FIX2); else the AI job id.
    // A comparison on the map replaces the AI layer (CMP2), so the address names the comparison instead.
    if (datasetId && shownComparisonId) params.set("comparison", shownComparisonId);
    else if (datasetId && selectedResult?.datacubeId) params.set("ai", selectedResult.datacubeId);
    else if (datasetId && resultKey && !resultKey.startsWith("link:")) params.set("ai", resultKey);
    if (datasetId && drawer === "result") params.set("tool", "result");
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`)
      window.history.replaceState(window.history.state, "", next);
  }, [loading, initialDatasetId, datasetId, projectId, activeVariable, times, timeIndex, displayMode, compareIndex, aiCompare, resultKey, selectedResult?.datacubeId, shownComparisonId, drawer]);
  // ←/→ step through times, Space plays or pauses, unless a field, button or dialog has focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (tourOpen || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      if (ownsKeys(event.target, event.key) || document.querySelector("[role='dialog'][aria-modal='true'], [role='alertdialog'][aria-modal='true']")) return;
      if (times.length < 1) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setPlaying(false);
        setTimeIndex((current) =>
          Math.min(times.length - 1, Math.max(0, current + (event.key === "ArrowRight" ? 1 : -1))),
        );
      } else if (event.key === " " && times.length > 1) {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [times.length, tourOpen]);
  useEffect(() => {
    if (!datasetId || useMockApi) {
      if (datasetId) setDetailReadyId(datasetId);
      setViewerNotice(null);
      return;
    }
    if (detailLoadedRef.current === datasetId) return;
    const catalogItem = selected;
    if (!catalogItem) return;
    detailLoadedRef.current = datasetId;
    backofficeAdapter
      .getDatasetDetail(datasetId)
      .then((detail) => {
        const resolved = {
          ...detail,
          xcubeDatasetId: catalogItem.xcubeDatasetId || detail.xcubeDatasetId,
        };
        setDatasets((current) =>
          current.map((item) =>
            item.id === datasetId
              ? { ...item, ...resolved, projectId: item.projectId }
              : item,
          ),
        );
        setViewerNotice(null);
      })
      .catch((cause) => setViewerNotice({ cause }))
      .finally(() => setDetailReadyId(datasetId));
  }, [datasetId, selected]);
  // Source tile url of a time index (null when there is no xcube layer to show).
  const sourceTileUrlAt = useCallback(
    (index: number) => {
      if (!selectedId || useMockApi || !activeVariable || !selectedXcubeDatasetId) return null;
      return selectedTileBase || tileStyle
        ? backofficeAdapter.tileUrl(selectedXcubeDatasetId, activeVariable, times[index]?.iso, selectedTileBase, tileStyle)
        : backofficeAdapter.tileUrl(selectedXcubeDatasetId, activeVariable, times[index]?.iso);
    },
    [selectedId, activeVariable, selectedXcubeDatasetId, selectedTileBase, tileStyle, times],
  );
  const sourceTileUrl = useMemo(() => sourceTileUrlAt(timeIndex), [sourceTileUrlAt, timeIndex]);
  // A tile failure notice belongs to the band/dataset it came from; a different layer starts clean.
  const tileLayerKey = `${selectedXcubeDatasetId}|${activeVariable}`;
  useEffect(() => setViewerNotice((notice) => (notice?.tile ? null : notice)), [tileLayerKey]);
  const nextIndex = times.length < 2 ? -1 : timeIndex < times.length - 1 ? timeIndex + 1 : loop ? 0 : -1;
  const nextTileUrl = useMemo(
    () => (playing && nextIndex >= 0 ? sourceTileUrlAt(nextIndex) : null),
    [playing, nextIndex, sourceTileUrlAt],
  );
  // FR-VIEW-12: the shown frame counts as drawn once its visible tiles have loaded (or nothing to draw).
  const frameReady = !sourceTileUrl || !sourceVisible || shownTileUrl === sourceTileUrl;
  // Playback advances only when the minimum time per frame has passed AND the frame is drawn.
  useEffect(() => {
    setFrameDue(false);
    if (!playing || times.length < 2) return;
    const timer = window.setTimeout(() => setFrameDue(true), playbackInterval(speed));
    return () => window.clearTimeout(timer);
  }, [playing, speed, timeIndex, times.length]);
  useEffect(() => {
    if (!playing || !frameDue || !frameReady || times.length < 2) return;
    setFrameDue(false);
    setTimeIndex((current) => (current === times.length - 1 ? (loop ? 0 : current) : current + 1));
  }, [playing, frameDue, frameReady, loop, times.length]);
  useEffect(() => {
    if (!loop && playing && timeIndex === times.length - 1) setPlaying(false);
  }, [timeIndex, times.length, loop, playing]);
  // Playback needs two or more times; a dataset with one time never stays in the playing state.
  const canPlay = times.length > 1;
  useEffect(() => {
    if (!canPlay && playing) setPlaying(false);
  }, [canPlay, playing]);
  useEffect(() => {
    frameBuffer.current?.setStyle(sourceVisible, sourceOpacity / 100);
  }, [sourceVisible, sourceOpacity, map]);
  useEffect(() => {
    if (!map) return;
    const buffer = new FrameBuffer(map, {
      // A failed tile (e.g. one band or RGB this server cannot draw) is a passing notice, not a Viewer error:
      // the Viewer stays usable for other bands and datasets.
      create: (url) => addDynamicXcubeLayer({ map, tileUrl: url, bbox: selectedBboxRef.current, onError: (error) => tileFailRef.current(error) }),
      onShown: setShownTileUrl,
    });
    buffer.setStyle(sourceVisibleRef.current, sourceOpacityRef.current / 100);
    frameBuffer.current = buffer;
    return () => {
      buffer.destroy();
      if (frameBuffer.current === buffer) frameBuffer.current = null;
    };
  }, [map]);
  useEffect(() => {
    // Same dataset (time, variable or style change): keep the old frame until the new one is drawn.
    // Another dataset covers another place, so its old frame goes at once.
    const keepOld = shownDatasetRef.current === selectedXcubeDatasetId;
    shownDatasetRef.current = selectedXcubeDatasetId;
    frameBuffer.current?.show(sourceTileUrl, keepOld);
  }, [map, sourceTileUrl, selectedXcubeDatasetId]);
  useEffect(() => {
    // Warm the next frame only while playing, after the current one is drawn.
    frameBuffer.current?.preload(nextTileUrl && frameReady ? nextTileUrl : null);
  }, [map, nextTileUrl, frameReady]);
  // The date moves at once while the map still shows the old frame until the new tiles arrive. Say so — while
  // playing only once the frame is overdue, by hand after 150 ms so a quick swap never flickers (S7, UX8).
  const frameWaiting = !frameReady && (!playing || frameDue);
  const [waitShown, setWaitShown] = useState(false);
  useEffect(() => {
    if (!frameWaiting) {
      setWaitShown(false);
      return;
    }
    const timer = window.setTimeout(() => setWaitShown(true), FRAME_WAIT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [frameWaiting]);

  const compareTileUrl =
    displayMode !== "single" &&
    !useMockApi &&
    activeVariable &&
    selectedXcubeDatasetId &&
    times[compareIndex]
      ? backofficeAdapter.tileUrl(
          selectedXcubeDatasetId,
          activeVariable,
          times[compareIndex].iso,
          selectedTileBase,
          tileStyle,
        )
      : null;
  // AI result: water_mask of the result dataset at the shown time, from its own xcube id and server.
  const resultXcubeId = resultCube?.xcubeDatasetId || selectedResult?.xcubeDatasetId;
  const resultIsos = useMemo(
    () => (resultCube?.times.length ? resultCube.times.map((time) => time.iso) : resultStats?.times.map((stat) => stat.time) ?? []),
    [resultCube, resultStats],
  );
  const resultTime = selectedResult ? matchTime(resultIsos, times[timeIndex]?.iso) : null;
  const resultTileUrl =
    !useMockApi && !resultTilesWait && resultXcubeId && resultTime
      ? backofficeAdapter.tileUrl(resultXcubeId, "water_mask", resultTime, resultCube?.tileBaseUrl, aiMaskStyle(theme))
      : null;
  const sourceTileUrlA =
    !useMockApi && activeVariable && selectedXcubeDatasetId && times[timeIndex]
      ? backofficeAdapter.tileUrl(selectedXcubeDatasetId, activeVariable, times[timeIndex].iso, selectedTileBase, tileStyle)
      : null;
  useCompareLayer({
    map,
    tileUrl: resultVisible && !aiCompare ? resultTileUrl : null,
    bbox: selectedBbox,
    visible: resultVisible,
    opacity: resultOpacity,
    zIndex: 6,
  });
  useCompareLayer({
    map,
    tileUrl: displayMode === "swipe" ? (aiCompare ? resultTileUrl : compareTileUrl) : null,
    bbox: selectedBbox,
    visible: aiCompare ? true : sourceVisible,
    opacity: aiCompare ? resultOpacity : sourceOpacity,
    swipeRef,
    zIndex: aiCompare ? 6 : 5,
  });
  useCompareLayer({
    map: compareMap,
    tileUrl: displayMode === "split" ? (aiCompare ? sourceTileUrlA : compareTileUrl) : null,
    bbox: selectedBbox,
    visible: sourceVisible,
    opacity: sourceOpacity,
  });
  useCompareLayer({
    map: compareMap,
    tileUrl: displayMode === "split" && aiCompare ? resultTileUrl : null,
    bbox: selectedBbox,
    visible: true,
    opacity: resultOpacity,
    zIndex: 6,
  });
  // CMP2: the comparison's class map over the original (0 transparent, F3 colours). Its catalog entry gives the exact
  // time coordinate and serving xcube; until it answers (or if it cannot) the list item's values are used.
  const [comparisonCube, setComparisonCube] = useState<{ id: string; cube: ZarrDataset | null } | null>(null);
  useEffect(() => {
    if (!shownComparisonId || useMockApi) return;
    let alive = true;
    originComparisonsApi
      .detail(shownComparisonId)
      .then((cube) => alive && setComparisonCube({ id: shownComparisonId, cube }))
      .catch(() => alive && setComparisonCube({ id: shownComparisonId, cube: null }));
    return () => {
      alive = false;
    };
  }, [shownComparisonId]);
  const shownCube = shownComparison && comparisonCube?.id === shownComparison.id ? comparisonCube : null;
  const comparisonTileUrl =
    !useMockApi && shownComparison && shownCube && (shownCube.cube?.xcubeDatasetId || shownComparison.xcubeDatasetId)
      ? backofficeAdapter.tileUrl(
          shownCube.cube?.xcubeDatasetId || shownComparison.xcubeDatasetId,
          "class",
          shownCube.cube?.times[0]?.iso ?? shownComparison.mapTime,
          shownCube.cube?.tileBaseUrl ?? shownComparison.tileBaseUrl,
          shownComparison.type ? comparisonStyle(shownComparison.type) : undefined,
        )
      : null;
  useCompareLayer({
    map,
    tileUrl: comparisonTileUrl,
    bbox: shownComparison?.bbox ?? selectedBbox,
    visible: true,
    opacity: 90,
    zIndex: 7,
  });
  const changeSwipe = useCallback(
    (value: number) => {
      swipeRef.current = value;
      setSwipe(value);
      map?.render();
    },
    [map],
  );
  const changeDisplayMode = useCallback(
    (mode: DisplayMode) => {
      setDisplayMode(mode);
      if (mode !== "single")
        setCompareIndex((current) =>
          current >= 0 && current < times.length && current !== timeIndex
            ? current
            : timeIndex > 0
              ? timeIndex - 1
              : Math.min(1, times.length - 1),
        );
    },
    [times.length, timeIndex],
  );
  const compareActive = !!selected && displayMode !== "single" && canCompare;
  // FIX4: another dataset resets time B; a comparison still on picks a B of the new dataset (else B would be "—").
  useEffect(() => {
    if (displayMode === "single" || times.length < 2 || (compareIndex >= 0 && compareIndex < times.length)) return;
    setCompareIndex(timeIndex > 0 ? timeIndex - 1 : 1);
  }, [displayMode, times.length, compareIndex, timeIndex]);
  useEffect(() => {
    if (selected && !canCompare && displayMode !== "single") setDisplayMode("single");
  }, [selected, canCompare, displayMode]);
  useEffect(() => {
    // With a single time the only comparison is 원본 ↔ AI 결과.
    if (times.length < 2 && selectedResult && compareTarget !== "ai") setCompareTarget("ai");
  }, [times.length, selectedResult, compareTarget]);
  const onMapReady = useCallback((instance: Map) => setMap(instance), []);
  // Focus follows the panel (UX13): into it when it opens, back to what opened it when it closes.
  const focusNextRef = useRef<(() => HTMLElement | null | undefined) | null>(null);
  useEffect(() => {
    const next = focusNextRef.current;
    if (!next) return;
    focusNextRef.current = null;
    next()?.focus();
  });
  const drawerBoxRef = useRef<HTMLElement>(null);
  /** VX1: every tool opens at its top (the body is shared, so a scrolled area result must not carry over). */
  const drawerBodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (drawerBodyRef.current) drawerBodyRef.current.scrollTop = 0;
  }, [drawer]);
  const tourButtonRef = useRef<HTMLButtonElement>(null);
  const drawerTitleRef = useRef<HTMLHeadingElement>(null);
  const railRefs = useRef<Partial<Record<Tool, HTMLButtonElement | null>>>({});
  const drawerReturnRef = useRef<HTMLElement | null>(null);
  const drawerRef = useRef<Drawer>(drawer);
  drawerRef.current = drawer;
  const splitActiveRef = useRef(false);
  /** Opens (or switches) the tool panel. `focus`: opened from a button, so focus moves into it and returns there on close. */
  const openRightPanel = useCallback((type: Tool, focus = false) => {
    if (focus) {
      if (!drawerRef.current) drawerReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      focusNextRef.current = () => drawerTitleRef.current;
    }
    setDrawer(type);
    setVisited((list) => (list.includes(type) ? list : [...list, type]));
  }, []);
  /** A rail button opens its tool, or closes the panel when that tool is already open. */
  const toggleRightPanel = (type: Tool) => {
    if (drawer === type) requestClose();
    else openRightPanel(type, true);
  };
  // CMP2: `?tool=result` opens 결과 비교; `&comparison={id}` (notification link) puts that comparison on the map once
  // the original's comparisons are known. Without a comparison the AI layer comes on as from the rail.
  useEffect(() => {
    const pending = urlStateRef.current;
    if (!selected || pending.dataset !== selected.id || !pending.tool) return;
    if (pending.tool !== "result") {
      urlStateRef.current = { ...pending, tool: undefined, comparison: undefined };
      return;
    }
    if (drawerRef.current !== "result") openRightPanel("result");
    if (pending.comparison && comparisonItems === undefined) return;
    urlStateRef.current = { ...urlStateRef.current, tool: undefined, comparison: undefined };
    const match = pending.comparison ? comparisonItems?.find((item) => item.id === pending.comparison) : undefined;
    if (match) {
      showComparison(match);
      // The AI group comes first in the panel: bring the shown card into view (no focus move).
      window.setTimeout(() => document.querySelector(`[data-cmp-show="${match.id.replace(/["\\]/g, "\\$&")}"]`)?.scrollIntoView?.({ block: "nearest" }), 120);
    } else wantAiLayerRef.current = true;
  }, [selected, comparisonItems, openRightPanel, showComparison]);
  useEffect(() => {
    if (!wantAiLayerRef.current || drawer !== "result" || !readyEntries.length || shownComparisonRef.current) return;
    wantAiLayerRef.current = false;
    setResultVisible(true);
  }, [drawer, readyEntries.length]);
  // Leaving 결과 비교 (closing it in any way, another tool) takes the comparison, its legend and banner off (FIX4 rule).
  useEffect(() => {
    if (drawer === "result") return;
    wantAiLayerRef.current = false;
    if (shownComparisonRef.current) showComparison(null);
  }, [drawer, showComparison]);
  // Comparisons listed in an open 결과 비교 count as seen in this browser (the rail dot goes).
  const comparisonIds = comparisonList.map((item) => item.id).join(",");
  useEffect(() => {
    if (drawer !== "result" || !comparisonIds) return;
    const ids = comparisonIds.split(",");
    markComparisonsSeen(ids);
    setSeenIds((current) => (ids.every((id) => current.has(id)) ? current : new Set([...Array.from(current), ...ids])));
  }, [drawer, comparisonIds]);
  const canDeleteComparison = (item: OriginComparison) =>
    !addLocked && !item.isExample && (item.accessType ? item.accessType === "OWNED" : !!user && item.ownerUserId === String(user.id));
  const deleteComparison = async (item: OriginComparison) => {
    await appApi.deleteDataset(item.id);
    deletedComparisonsRef.current.add(item.id);
    if (shownComparisonRef.current === item.id) showComparison(null, false);
    setComparisons((current) => (current?.items ? { ...current, items: current.items.filter((entry) => entry.id !== item.id) } : current));
    setComparisonNews(t("viewer.cmps.removed", { name: item.name }));
    // The card is gone: focus goes to the group heading once the dialog has handed focus back (same commit).
    focusNextRef.current = () => document.getElementById("vx-cmps-title");
  };
  const toggleComparison = (item: OriginComparison) => showComparison(shownComparisonRef.current === item.id ? null : item);
  /** 비교 끄기 on the banner: focus goes to the card's 지도에 보기 so the keyboard does not lose its place. */
  const comparisonOff = () => {
    const id = shownComparisonRef.current;
    showComparison(null);
    focusNextRef.current = () => (id ? document.querySelector<HTMLElement>(`[data-cmp-show="${id.replace(/["\\]/g, "\\$&")}"]`) : null) ?? drawerTitleRef.current;
  };
  /** Time series at a map coordinate: from a click with the pixel tool, the keyboard reticle or the focused map's centre. */
  const queryPixel = useCallback(
    async (coordinate: [number, number]) => {
      if (!selected || (!sourceVisible && !resultVisible)) return;
      const run = (pixelRunRef.current += 1);
      setPixelTip(false);
      setPlaying(false);
      setViewerNotice(null);
      const lonLat = toLonLat(coordinate) as [number, number];
      setPixelLonLat({ lon: lonLat[0], lat: lonLat[1] });
      if (!useMockApi && (!activeVariable || activeVariable === "rgb")) {
        // No series for RGB: an earlier pixel's graph must not stay under the new place's name.
        setPixel(null);
        setSeriesPoints([]);
        setViewerNotice({ key: activeVariable === "rgb" ? "viewer.toast.rgbNoSeries" : "viewer.toast.noVariable" });
        return;
      }
      setGraphExpanded(true);
      setPixel(coordinate);
      if (useMockApi) {
        const values = [60, 49, null, 32, 37, 20, 28, 15];
        setSeriesPoints(
          values.map((value, index) => ({
            time:
              times[index]?.iso ??
              new Date(Date.UTC(2025, index, 1)).toISOString(),
            value,
          })),
        );
        setPixel(coordinate);
        return;
      }
      try {
        setSeriesPoints([]);
        const points = await backofficeAdapter.getTimeseries(
          selected.id,
          activeVariable,
          {
            lon: lonLat[0],
            lat: lonLat[1],
            startDate: times[0]?.iso,
            endDate: times[times.length - 1]?.iso,
            maxValids: 1000,
          },
        );
        if (pixelRunRef.current !== run) return;
        // An empty series is explained once, inside the reading row (no extra toast).
        if (!points.length) return;
        setSeriesPoints(points);
        setPixel(coordinate);
      } catch (cause) {
        if (pixelRunRef.current === run) setViewerNotice({ cause });
      }
    },
    [selected, sourceVisible, resultVisible, times, activeVariable],
  );
  // FIX4: the graph names the shown band, so another band re-reads the chosen pixel (RGB has no series).
  const pixelRef = useRef(pixel);
  pixelRef.current = pixel;
  const queryPixelRef = useRef(queryPixel);
  queryPixelRef.current = queryPixel;
  useEffect(() => {
    const at = pixelRef.current;
    if (at) queryPixelRef.current(at);
  }, [activeVariable]);
  const onPixelSelect = useCallback(
    (coordinate: [number, number]) => {
      if (mapTool === "pixel") queryPixel(coordinate);
    },
    [mapTool, queryPixel],
  );
  const selectMapTool = (tool: MapTool, fromKeyboard = false) => {
    setMapTool(tool);
    setPixelTip(tool === "pixel");
    // The pixel tool and an area drawing would both take the map click: the pixel tool wins.
    if (tool === "pixel" && area.drawing) area.cancel();
    if (tool !== "pixel") {
      setProbe(null);
      return;
    }
    focusProbeRef.current = fromKeyboard;
    const box = mapBoxRef.current?.getBoundingClientRect();
    const width = box?.width ?? 0;
    const height = box?.height ?? 0;
    const splitView = displayMode === "split" && canCompare;
    setProbe((current) => current ?? [splitView ? width / 4 : width / 2, height / 2]);
  };
  useEffect(() => {
    if (!probe || !focusProbeRef.current) return;
    focusProbeRef.current = false;
    probeRef.current?.focus();
  }, [probe]);
  const queryProbe = () => {
    if (!probe || !map || typeof map.getCoordinateFromPixel !== "function") return;
    const coordinate = map.getCoordinateFromPixel(probe);
    if (coordinate) onPixelSelect(coordinate as [number, number]);
  };
  const moveProbe = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 40 : 8;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (event.key === "Escape") {
      event.preventDefault();
      selectMapTool("pan");
      return;
    }
    const move = delta[event.key];
    if (!move || !probe) return;
    event.preventDefault();
    const box = mapBoxRef.current?.getBoundingClientRect();
    const maxX = box?.width || Infinity;
    const maxY = box?.height || Infinity;
    setProbe([
      Math.min(maxX, Math.max(0, probe[0] + move[0])),
      Math.min(maxY, Math.max(0, probe[1] + move[1])),
    ]);
  };
  const clearPixel = () => {
    pixelRunRef.current += 1;
    setPixel(null);
    setPixelLonLat(null);
    setSeriesPoints([]);
    setGraphExpanded(false);
    setPixelTip(false);
  };
  const zoomMap = (delta: number) => {
    if (!map) return;
    const view = map.getView();
    view.animate({
      zoom: (view.getZoom() ?? 0) + delta,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 180,
    });
  };
  const fitDataset = () => {
    if (!map || !selectedBbox) return;
    const projection = map.getView().getProjection().getCode();
    const extent =
      projection === "EPSG:4326"
        ? selectedBbox
        : transformExtent(selectedBbox, "EPSG:4326", projection);
    map.getView().fit(extent, {
      padding: [48, 48, 48, 48],
      maxZoom: 16,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 180,
    });
  };
  useEffect(() => {
    // Fit only when a different Zarr is selected. Time-frame playback must not
    // change the user's map center or zoom.
    if (
      !map ||
      typeof map.getView !== "function" ||
      !selectedId ||
      !selectedBbox
    )
      return;
    const projection = map.getView().getProjection().getCode();
    const extent =
      projection === "EPSG:4326"
        ? selectedBbox
        : transformExtent(selectedBbox, "EPSG:4326", projection);
    map.getView().fit(extent, {
      padding: [48, 48, 48, 48],
      maxZoom: 16,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 180,
    });
  }, [map, selectedId, selectedBbox]);
  /** UXF1 (FIX4 §4.1): exports still being made when the export panel closes — ask whether they keep going. */
  const exportRunningRef = useRef<string[]>([]);
  const onExportRunning = useCallback((ids: string[]) => { exportRunningRef.current = ids; }, []);
  const [exportLeave, setExportLeave] = useState<string[] | null>(null);
  /** Closing from a button or Esc: the export panel with running exports asks first; everything else closes. */
  function requestClose() {
    if (drawerRef.current === "export" && exportRunningRef.current.length) setExportLeave(exportRunningRef.current);
    else closeRightPanel();
  }
  const leaveExports = async (cancel: boolean) => {
    const ids = exportLeave ?? [];
    setExportLeave(null);
    if (cancel) await Promise.allSettled(ids.map((id) => exportsApi.cancel(id)));
    closeRightPanel();
  };
  function closeRightPanel() {
    const closing = drawerRef.current;
    setDrawer(null);
    // 결과 비교 is also the switch for seeing the AI result (UX13B): however it is closed (its rail button, the close
    // button, Esc), the AI water layer goes and an AI-result comparison goes back to comparing times (FIX4).
    if (closing === "result" && hasInference) {
      setResultVisible(false);
      setCompareTarget((target) => (target === "ai" ? "time" : target));
    }
    const back = drawerReturnRef.current;
    drawerReturnRef.current = null;
    focusNextRef.current = () => (back?.isConnected ? back : closing ? railRefs.current[closing] : null);
  }
  // Keep centre and zoom when the graph panel opens or closes. Skip the first run so it
  // does not undo the fit to a dataset selected right at load (/app/viewer?dataset=…).
  const layoutRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      !map ||
      typeof map.getView !== "function" ||
      typeof map.updateSize !== "function"
    )
      return;
    const layout = `${graphExpanded}|${pixel ? 1 : 0}`;
    const first = layoutRef.current === null;
    const changed = layoutRef.current !== layout;
    layoutRef.current = layout;
    if (first || !changed) return;
    const view = map.getView();
    const center = view.getCenter()?.slice();
    const resolution = view.getResolution();
    const timer = window.setTimeout(() => {
      map.updateSize();
      if (center) view.setCenter(center);
      if (resolution != null) view.setResolution(resolution);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [map, graphExpanded, pixel]);
  const startAi = async (request: AiJobRequest) => {
    // One request at a time: the service runs an input check before answering, so repeated clicks used to
    // start a second check beside the running inference (exit 137 on a busy machine).
    if (aiStartingRef.current) return;
    aiStartingRef.current = true;
    setAiStarting(true);
    setAiRunError(null);
    try {
      const job = await ai.createJob({
        ...request,
        datacubeId: cubeId(String(request.datacubeId)),
        ...(projectId ? { projectId: cubeId(projectId) } : {}),
      });
      // The service answers with the job summary; keep the request so the run stays tied to this dataset.
      setAiRun({ ...job, input: { ...request, ...(job.input ?? {}), datacubeId: String(request.datacubeId) } });
      setAiTick((value) => value + 1);
    } catch (cause) {
      setAiRunError(cause ?? new Error());
    } finally {
      aiStartingRef.current = false;
      setAiStarting(false);
    }
  };
  const cancelAi = async () => {
    if (!aiRun) return;
    try {
      await ai.cancelJob(aiRun.id);
      setAiRun({ ...aiRun, status: "CANCELLED" });
      setAiTick((value) => value + 1);
    } catch (cause) {
      setAiRunError(cause ?? new Error());
    }
  };
  const retryAi = async () => {
    if (!aiRun) return;
    setAiRunError(null);
    try {
      const again = await ai.retryJob(aiRun.id);
      setAiRun({ ...again, input: again.input ?? aiRun.input });
      setAiTick((value) => value + 1);
    } catch (cause) {
      setAiRunError(cause ?? new Error());
    }
  };
  /** Same input as the shown result, another threshold (the estimate made real). */
  const rerunAi = (threshold: number) => {
    const input = selectedResult?.job?.input;
    if (!selected || !input?.modelId) return;
    setDrawer("ai");
    startAi({
      datacubeId: selected.id,
      modelId: String(input.modelId),
      threshold: Number(threshold.toFixed(2)),
      ...(input.timeStart ? { timeStart: String(input.timeStart) } : {}),
      ...(input.timeEnd ? { timeEnd: String(input.timeEnd) } : {}),
      name: t("viewer.ai.form.rerunName", { name: selectedResult?.name ?? selected.name, threshold: threshold.toFixed(2) }),
    });
  };
  const chooseResult = (entry: ResultEntry) => {
    setResultKey(entry.key);
    setResultVisible(true);
    openRightPanel("result");
  };
  /** VX1: `결과 비교에서 보기` after a finished run — that result, on the map, in 결과 비교. */
  const showRunResult = (run: AiWaterJob) => {
    const entry = readyEntries.find((item) => item.job?.id === run.id) ?? readyEntries.find((item) => item.name === run.name);
    if (entry) setResultKey(entry.key);
    if (entry || hasInference) setResultVisible(true);
    if (comparisonOrigin) setComparisonTick((value) => value + 1);
    focusNextRef.current = () => drawerTitleRef.current;
    openRightPanel("result");
  };
  /** VX1: 원본 ↔ AI 결과 swipe in one press from 결과 비교 (the dock's mode + target, together). */
  const toggleAiSwipe = () => {
    if (aiCompare && displayMode === "swipe") {
      changeDisplayMode("single");
      return;
    }
    setCompareTarget("ai");
    changeDisplayMode("swipe");
  };
  /** VX1: the summary's shortcuts move to a group (and its heading, for the keyboard). */
  const jumpTo = (id: string) => {
    const heading = document.getElementById(id);
    heading?.scrollIntoView?.({ block: "start" });
    heading?.focus({ preventScroll: true });
  };
  const labelOf = (iso: string) => {
    const match = matchTime(times.map((time) => time.iso), iso);
    return times.find((time) => time.iso === match)?.label ?? (Number.isFinite(Date.parse(iso)) ? formatDate(iso, lang) : iso);
  };
  // AI results are reached through their source dataset, not picked as layers of their own.
  const pickable = useMemo(() => datasets.filter((item) => item.kind !== "AI_RESULT"), [datasets]);
  const pickableProject = useMemo(() => projectDatasets.filter((item) => item.kind !== "AI_RESULT"), [projectDatasets]);
  const projectName = projects.find((item) => item.id === projectId)?.name;
  // With personal pods on, the pill shows the user's own xcube; otherwise the main server.
  const podLabel: Record<string, TKey> = {
    READY: "viewer.status.podReady",
    STARTING: "viewer.status.podStarting",
    ERROR: "viewer.status.podError",
  };
  const connectionLabel: TKey =
    xcubeConnected === null
      ? "viewer.status.checking"
      : xcubeConnected
        ? "viewer.status.connected"
        : "viewer.status.disconnected";
  // ABSENT: everything of this user is already merged into the main xcube, so show the main server.
  const showPod = !!podState && podState !== "ABSENT";
  const statusText = showPod ? (podLabel[podState!] ? t(podLabel[podState!]) : podState!) : t(connectionLabel);
  // Status is said in words; the icon shape differs per state so colour is never the only cue.
  const statusTone: "online" | "offline" | "starting" | "unknown" = showPod
    ? podState === "READY"
      ? "online"
      : podState === "ERROR"
        ? "offline"
        : podState === "STARTING"
          ? "starting"
          : "unknown"
    : xcubeConnected === false
      ? "offline"
      : xcubeConnected
        ? "online"
        : "unknown";
  const StatusIcon = {
    online: CircleCheck,
    offline: CircleAlert,
    starting: LoaderCircle,
    unknown: CircleDashed,
  }[statusTone];
  const userName = user?.name ?? t("viewer.top.user");
  const currentProject = projects.find((item) => item.id === projectId);
  const splitActive = compareActive && displayMode === "split";
  // Side by side (UX13): close the tool panel so both maps keep about half the width; leaving side by side brings
  // back the tool that was open. A tool opened during side by side sits beside the maps (CSS), not over map B.
  const splitRestoreRef = useRef<Drawer | undefined>(undefined);
  useEffect(() => {
    splitActiveRef.current = splitActive;
    if (splitActive) {
      splitRestoreRef.current = drawerRef.current;
      setDrawer(null);
    } else if (splitRestoreRef.current !== undefined) {
      const before = splitRestoreRef.current;
      splitRestoreRef.current = undefined;
      setDrawer((open) => open ?? before);
    }
  }, [splitActive]);
  // Entry with datasets shows the map and one plain hint; the tour explains the rest.
  const emptyMessage = loading
    ? t("viewer.empty.loading")
    : apiError ||
      (datasets.length || noDataHidden
        ? ""
        : t("viewer.empty.noData"));
  const pickHint = !selected && !loading && !apiError && datasets.length > 0 && !pickHintHidden;

  // ── UR-63 F1: the area drawn for area statistics (overprint magenta: the user's mark) ──
  const markColor = useMemo(() => cssColor("--fb-overprint", theme === "dark" ? "#ff6fb3" : "#b8166f"), [theme]);
  const area = useAreaDraw(map, markColor);
  const clearArea = area.clear;
  const cancelAreaDraw = area.cancel;
  const areaDrawing = !!area.drawing;
  useEffect(() => {
    clearArea();
  }, [selectedId, clearArea]);
  // FIX4: the drawn area belongs to 영역 통계 and is shared only with 내보내기. Leaving 영역 통계 always stops a
  // drawing in progress; closing the panel or moving to another tool clears the shape, its legend and the area
  // result (the area panel unmounts, which also drops a query still running). Side by side closes the panel by
  // itself and brings the tool back afterwards, so that close keeps the shape.
  useEffect(() => {
    if (drawer !== "area" && areaDrawing) cancelAreaDraw();
  }, [drawer, areaDrawing, cancelAreaDraw]);
  useEffect(() => {
    if (drawer === "area" || drawer === "export") return;
    const restoring = splitRestoreRef.current;
    if (drawer === null && splitActiveRef.current && (restoring === "area" || restoring === "export")) return;
    clearArea();
    setVisited((list) => (list.includes("area") ? list.filter((tool) => tool !== "area") : list));
  }, [drawer, clearArea]);
  const startDraw = (kind: "polygon" | "rect") => {
    selectMapTool("pan");
    area.start(kind);
  };
  const mapExtent4326 = useCallback((): [number, number, number, number] | null => {
    if (!map || typeof map.getView !== "function" || typeof map.getSize !== "function") return null;
    const size = map.getSize();
    if (!size) return null;
    const view = map.getView();
    const extent = view.calculateExtent(size);
    const projection = view.getProjection().getCode();
    return (projection === "EPSG:4326" ? extent : transformExtent(extent, projection, "EPSG:4326")) as [number, number, number, number];
  }, [map]);
  /** 지금 화면: the view as a rectangle, cut to the data's extent so the whole shape has values. */
  const areaFromView = () => {
    if (!map || typeof map.getView !== "function") return;
    const size = map.getSize();
    if (!size) return;
    const view = map.getView();
    const projection = view.getProjection().getCode();
    let extent = view.calculateExtent(size);
    if (selectedBbox) {
      const data = projection === "EPSG:4326" ? selectedBbox : transformExtent(selectedBbox, "EPSG:4326", projection);
      const cut = [Math.max(extent[0], data[0]), Math.max(extent[1], data[1]), Math.min(extent[2], data[2]), Math.min(extent[3], data[3])];
      if (cut[0] < cut[2] && cut[1] < cut[3]) extent = cut;
    }
    selectMapTool("pan");
    area.fromView(extent);
  };
  /** What area statistics can measure: the shown data (its band), and the AI result shown with it (water area). */
  const measurable = useMemo(() => (selected?.variables ?? []).filter((band) => band !== "rgb"), [selected?.variables]);
  const measuredBand = selected ? (activeVariable && activeVariable !== "rgb" ? activeVariable : measurable.find((band) => !isAuxiliary(selected, band)) ?? measurable[0] ?? "") : "";
  const resultDatacubeId = selectedResult?.datacubeId;
  const areaTargets = useMemo<AreaTarget[]>(() => {
    if (!selected) return [];
    const list: AreaTarget[] = [
      { key: "source", label: t(selected.kind === "COMPARISON" ? "viewer.panel.comparison" : "viewer.panel.source"), datasetId: selected.id, variables: measurable, variable: measuredBand, water: false },
    ];
    if (resultDatacubeId && selected.kind !== "COMPARISON")
      list.push({ key: "ai", label: t("viewer.panel.aiResult"), datasetId: resultDatacubeId, variables: ["water_mask"], variable: "water_mask", water: true });
    return list;
  }, [selected, measurable, measuredBand, resultDatacubeId, t]);
  const exportTargets = useMemo<ExportTarget[]>(() => {
    if (!selected) return [];
    const bands = [...(hasRgb ? ["rgb"] : []), ...selected.variables.filter((band) => band !== "rgb")];
    const list: ExportTarget[] = [
      { key: "source", label: t(selected.kind === "COMPARISON" ? "viewer.panel.comparison" : "viewer.panel.source"), datasetId: selected.id, variables: bands, variable: activeVariable && bands.includes(activeVariable) ? activeVariable : bands[0] ?? "" },
    ];
    if (resultDatacubeId && selected.kind !== "COMPARISON") {
      const resultBands = resultCube?.variables?.length ? resultCube.variables : ["water_mask"];
      list.push({ key: "ai", label: t("viewer.panel.aiResult"), datasetId: resultDatacubeId, variables: resultBands, variable: resultBands.includes("water_mask") ? "water_mask" : resultBands[0] });
    }
    return list;
  }, [selected, hasRgb, activeVariable, resultDatacubeId, resultCube?.variables, t]);
  // Demo: the area-stats stand-in answers for the shown dataset's times.
  useEffect(() => {
    if (useMockApi) setAreaStatsDemoContext({ times: times.map((time) => time.iso), water: false });
  }, [times]);

  // ── UR-63 F2: the map PNG, framed like a map sheet (everything in the browser) ──
  const legendSpecs = async (): Promise<LegendSpec[]> => {
    const specs: LegendSpec[] = [];
    if (area.shape) specs.push({ kind: "outline", title: t("viewer.stats.legend"), text: `${legendValue(area.shape.areaKm2, lang)} km²`, color: "#b8166f" });
    if (selectedResult && (resultVisible || aiCompare) && resultTime) specs.push({ kind: "hatch", title: t("viewer.ai.legend.title"), text: `${selectedResult.name}`, color: "#3fb4ff" });
    if (showsClasses && comparisonType)
      specs.push({
        kind: "classes",
        title: t(`viewer.cmp.type.${comparisonType}`),
        classes: COMPARISON_CLASSES[comparisonType].map((item) => ({ color: item.color, label: t(`viewer.cmp.class.${item.key}`) })),
      });
    else if (activeVariable && sourceVisible) {
      if (activeVariable === "rgb") specs.push({ kind: "rgb", title: t("viewer.legend.rgb"), text: rgbBands?.length === 3 ? rgbMapping(rgbBands, lang) : t("viewer.legend.rgbFallback") });
      else {
        const classes = categoriesOf(variableStyle?.colorBarName);
        const units = variableStyle?.units && variableStyle.units !== "1" ? variableStyle.units : undefined;
        if (classes) specs.push({ kind: "classes", title: activeVariable, classes: classes.map((item) => ({ color: item.color, label: item.label ?? t("viewer.legend.code", { code: item.code }) })) });
        else {
          const stops = rampStops(variableStyle?.colorBarName) ?? ["#f3f5f2", "#1769aa"];
          const base = variableStyle?.colorBarName?.replace(/_alpha$/, "").replace(/_r$/, "");
          const previews = base ? await colorBarPreviews() : {};
          const image = base && previews[base] && !variableStyle?.colorBarName?.replace(/_alpha$/, "").endsWith("_r") ? await loadImage(`data:image/png;base64,${previews[base]}`) : null;
          const min = variableStyle?.colorBarMin;
          const max = variableStyle?.colorBarMax;
          specs.push({ kind: "ramp", title: activeVariable, units, stops, image, min: typeof min === "number" ? legendValue(min, lang) : undefined, max: typeof max === "number" ? legendValue(max, lang) : undefined });
        }
      }
    }
    return specs;
  };
  const makePng = async (title: string, signal?: AbortSignal) => {
    if (!map || typeof map.getSize !== "function") throw new Error("NO_MAP");
    const size = map.getSize();
    if (!size) throw new Error("NO_MAP");
    await settled(map);
    const first = snapshotMap(map);
    if (!first) throw new Error("NO_CANVAS");
    const timeLabel = times[timeIndex]?.label ?? "";
    const bandLabel = activeVariable === "rgb" ? t("viewer.legend.rgb") : activeVariable;
    const maps: Array<{ canvas: HTMLCanvasElement; label?: string }> = [{ canvas: first, label: splitActive ? (aiCompare ? `${t("viewer.compare.source")} · ${timeLabel}` : `A · ${timeLabel}`) : undefined }];
    if (splitActive && compareMap) {
      await settled(compareMap);
      const second = snapshotMap(compareMap);
      if (second) maps.push({ canvas: second, label: aiCompare ? `${t("viewer.compare.sourcePlusAi")} · ${timeLabel}` : `B · ${times[compareIndex]?.label ?? ""}` });
    }
    const width = splitActive ? Math.round(size[0] / 2) : size[0];
    const scale = niceScale((await metersPerPixel(map)) ?? NaN, 120, lang);
    const attribution = [t("viewer.export.png.osm"), t("viewer.export.png.data", { name: selected?.name ?? "" }), ...(selectedResult && (resultVisible || aiCompare) ? [t("viewer.export.png.ai", { name: selectedResult.name })] : [])].join(" · ");
    const blob = await sheetPng(
      {
        title,
        subtitle: [bandLabel, timeLabel].filter(Boolean).join(" · "),
        maps: maps.map((item) => ({ ...item })),
        legends: await legendSpecs(),
        scale,
        attribution,
        created: t("viewer.export.png.created", { time: new Date().toLocaleString(lang === "ko" ? "ko-KR" : "en-US", { dateStyle: "medium", timeStyle: "short" }) }),
      },
      width,
      size[1],
    );
    if (signal?.aborted) return;
    saveBlob(blob, pngFileName(title, times[timeIndex]?.iso?.slice(0, 10) ?? ""));
  };

  const toolDisabled = (tool: Tool): string | undefined => {
    if (tool === "layers") return undefined;
    if (!selected) return t("viewer.tools.needData");
    if (tool === "ai" && (selected.kind === "AI_RESULT" || selected.kind === "COMPARISON")) return t("viewer.tools.aiNotHere");
    return undefined;
  };
  // VX1: the "why" note goes once the reason is gone (a dataset was chosen) or another dataset is shown.
  useEffect(() => setRailTip(null), [selected?.id]);
  // A tool that cannot be used for the new dataset closes.
  useEffect(() => {
    if (drawer && drawer !== "layers" && (!selected || (drawer === "ai" && selected.kind === "COMPARISON"))) setDrawer(null);
  }, [drawer, selected]);
  const bandLabel = activeVariable === "rgb" ? t("viewer.legend.rgb") : activeVariable;
  const bandTitle = variableStyle?.title && variableStyle.title !== activeVariable ? variableStyle.title : "";

  return (
    <main className={`viewer vx ${drawer ? "has-drawer" : ""} ${drawer && sheetFull ? "has-full-sheet" : ""}`} aria-label={t("viewer.top.main")}>
      <h1 className="vx-sr">{selected ? t("viewer.top.heading", { name: selected.name }) : t("viewer.top.main")}</h1>
      {/* CMP2: says when a comparison goes on or off the map, or is deleted. */}
      <p className="vx-sr" role="status" aria-live="polite">{comparisonNews}</p>
      <header className="vx-top">
        <a className="vx-brand" href="/" aria-label={t("viewer.top.home")}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 3.2 19.6 7.6v8.8L12 20.8 4.4 16.4V7.6L12 3.2Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <path
              d="M4.4 7.6 12 12l7.6-4.4M12 12v8.8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
          </svg>
          <span className="vx-brand__name">XCube</span>
        </a>
        <nav className="vx-crumbs" aria-label={t("viewer.top.crumbs")}>
          <span className="vx-crumbs__project" data-tour="project">
            {/* Quick project actions stay in the Viewer; long tasks open the app pages in a new tab. */}
            <ProjectQuickMenu
              project={currentProject}
              dataset={selected}
              inProject={projectDatasets.some((item) => item.id === selected?.id)}
              onCreated={(created) => {
                setProjects((items) => [created, ...items]);
                setProjectId(created.id);
                setFlash(t("viewer.toast.projectCreated", { name: created.name }));
              }}
              onLinked={(dataset, project) => {
                setProjectDatasets((items) =>
                  items.some((item) => item.id === dataset.id)
                    ? items
                    : [...items, dataset],
                );
                setFlash(t("viewer.toast.linked", { dataset: dataset.name, project: project.name }));
              }}
            />
            <label className={`vx-crumb ${projectId ? "" : "is-none"}`}>
              <span className="vx-sr">{t("viewer.top.project")}</span>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                aria-label={t("viewer.top.projectSelect")}
              >
                <option value="">{t("viewer.top.noProject")}</option>
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
          </span>
          <span className="vx-crumbs__sep" aria-hidden="true">
            /
          </span>
          <DatasetPicker
            datasets={pickable}
            value={datasetId}
            onChange={setDatasetId}
            tourId="dataset"
            openRequest={pickerRequest}
            project={
              projectId
                ? { name: projectName ?? t("viewer.top.project"), items: pickableProject }
                : undefined
            }
            onUnavailable={(item) =>
              // Datasets reached only through a shared project are not in
              // the catalog list until the server grants project access.
              setNotice(t("viewer.toast.sharedOnly", { name: item.name }))
            }
          />
        </nav>
        {selected && (
          // UX2: what is on the map, in large type — the band (opens the layer tab) and the shown date.
          <div className="vx-now" aria-label={t("viewer.now.aria")} role="group">
            <button
              type="button"
              className="vx-now__band"
              onClick={() => (drawer === "layers" ? closeRightPanel() : openRightPanel("layers", true))}
              aria-label={t("viewer.now.bandAria", { band: bandLabel || t("viewer.now.noBand") })}
              title={bandTitle || t("viewer.now.bandTitle")}
            >
              <small>{t("viewer.now.band")}</small>
              <strong>{bandLabel || t("viewer.now.noBand")}</strong>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            <span className="vx-now__date">
              <small>{t("viewer.now.date")}</small>
              <strong className="tabular">{times[timeIndex]?.label ?? t("viewer.dock.noTime")}</strong>
            </span>
          </div>
        )}
        <div className="vx-top__actions">
          <span
            className={`vx-status is-${statusTone}`}
            title={statusText}
            role="status"
          >
            <StatusIcon size={15} aria-hidden="true" />
            <span className="vx-status__text">{statusText}</span>
            <span className="vx-status__short" aria-hidden="true">
              {t(`viewer.status.short.${statusTone}`)}
            </span>
          </span>
          {addLocked ? (
            <button
              type="button"
              className="vx-btn vx-btn--quiet"
              data-tour="add"
              aria-disabled="true"
              aria-label={t("viewer.top.addData")}
              aria-describedby="vx-add-locked"
              title={addLocked}
            >
              <Plus size={16} aria-hidden="true" />
              <span className="vx-hide-md">{t("viewer.top.addData")}</span>
              <span id="vx-add-locked" className="vx-sr">{addLocked}</span>
            </button>
          ) : (
            <a
              className="vx-btn vx-btn--quiet"
              data-tour="add"
              href="/app/data/new"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("viewer.top.addDataAria")}
              title={t("viewer.top.addDataTitle")}
            >
              <Plus size={16} aria-hidden="true" />
              <span className="vx-hide-md">{t("viewer.top.addData")}</span>
            </a>
          )}
          <button
            ref={tourButtonRef}
            type="button"
            className="vx-icon-btn"
            onClick={() => setTourOpen(true)}
            aria-label={t("viewer.top.tour")}
            title={t("viewer.top.tour")}
          >
            <CircleHelp size={18} aria-hidden="true" />
          </button>
          <UserMenu
            name={userName}
            theme={theme}
            onToggleTheme={toggleTheme}
            onLogout={onLogout}
          />
        </div>
      </header>

      <div className={`vx-body ${drawer ? "drawer-open" : ""} ${splitActive ? "is-split" : ""}`}>
        <section
          ref={mapBoxRef}
          className={`vx-map ${splitActive ? "is-split" : ""} ${compareActive ? "is-comparing" : ""}`}
          aria-label={t("viewer.map.region")}
        >
          <OlMap
            onMapReady={onMapReady}
            onPixelSelect={onPixelSelect}
            baseVisible={baseVisible}
            interactionMode={mapTool}
            keyboard={{
              label: selected ? t("viewer.map.keysLabel", { name: selected.name }) : t("viewer.map.keysLabelEmpty"),
              helpId: "vx-map-keys",
              onPick: selected ? queryPixel : undefined,
              onHome: selectedBbox ? fitDataset : undefined,
            }}
          />
          <p id="vx-map-keys" className="vx-sr">
            {t(selected ? "viewer.map.keysHelp" : "viewer.map.keysHelpEmpty")}
          </p>
          <div
            className="vx-tools"
            role="toolbar"
            aria-label={t("viewer.map.tools")}
            aria-orientation="vertical"
            data-tour="tools"
          >
            <div className="vx-tools__group">
              <button
                type="button"
                aria-label={t("viewer.map.pan")}
                title={t("viewer.map.pan")}
                aria-pressed={mapTool === "pan"}
                onClick={() => selectMapTool("pan")}
              >
                <Hand size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={t("viewer.map.pixel")}
                title={t("viewer.map.pixelTitle")}
                aria-pressed={mapTool === "pixel"}
                disabled={!selected}
                onClick={(event) => selectMapTool("pixel", event.detail === 0)}
              >
                <Crosshair size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="vx-tools__group">
              <button
                type="button"
                aria-label={t("viewer.map.zoomIn")}
                title={t("viewer.map.zoomIn")}
                onClick={() => zoomMap(1)}
              >
                <ZoomIn size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={t("viewer.map.zoomOut")}
                title={t("viewer.map.zoomOut")}
                onClick={() => zoomMap(-1)}
              >
                <ZoomOut size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={t("viewer.map.fit")}
                title={t("viewer.map.fit")}
                disabled={!selectedBbox}
                onClick={fitDataset}
              >
                <Scan size={18} aria-hidden="true" />
              </button>
            </div>
            {pixel && (
              <div className="vx-tools__group">
                <button
                  type="button"
                  aria-label={t("viewer.map.clearPixel")}
                  title={t("viewer.map.clearPixel")}
                  onClick={clearPixel}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          {mapTool === "pixel" && selected && probe && (
            <button
              ref={probeRef}
              type="button"
              className="vx-probe"
              style={{ left: probe[0], top: probe[1] }}
              aria-label={t("viewer.map.probe")}
              aria-describedby="vx-probe-hint"
              onKeyDown={moveProbe}
              onClick={queryProbe}
            >
              <span id="vx-probe-hint" className="vx-sr">
                {t("viewer.map.probeHint")}
              </span>
            </button>
          )}
          {pixelTip && (
            <div className="vx-toast" role="status">
              {t("viewer.map.pixelTip")}
            </div>
          )}
          {!selected && emptyMessage && (
            <div
              className={`vx-empty ${apiError ? "is-error" : ""}`}
              aria-live="polite"
            >
              {loading ? (
                <LoaderCircle size={20} className="vx-spin" aria-hidden="true" />
              ) : apiError ? (
                <CircleAlert size={20} aria-hidden="true" />
              ) : null}
              <p>{emptyMessage}</p>
              {!loading && !apiError && (addLocked ? (
                <>
                  <button type="button" className="vx-btn vx-btn--ink" aria-disabled="true" aria-describedby="vx-empty-add-locked">
                    <Plus size={16} aria-hidden="true" />
                    {t("viewer.top.addData")}
                  </button>
                  <small id="vx-empty-add-locked" className="vx-section__hint">{addLocked}</small>
                </>
              ) : (
                <a
                  className="vx-btn vx-btn--ink"
                  href="/app/data/new"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Plus size={16} aria-hidden="true" />
                  {t("viewer.top.addData")}
                </a>
              ))}
            </div>
          )}
          {pickHint && !tourOpen && (
            <div className="vx-empty vx-empty--pick">
              <p>
                <strong>{t("viewer.empty.pickTitle")}</strong>
                {t("viewer.empty.pickBody")}
              </p>
              <button
                type="button"
                className="vx-btn vx-btn--ink"
                onClick={() => setPickerRequest((value) => value + 1)}
              >
                {t("viewer.empty.pick")}
              </button>
            </div>
          )}
          {notice && (
            // An alert stays until it is closed (WCAG 2.2.1): it is never gone before it has been read.
            <div className="vx-toast vx-toast--notice" role="alert">
              <CircleAlert size={16} aria-hidden="true" />
              <span>{notice}</span>
              <button type="button" className="vx-icon-btn vx-toast__close" onClick={() => setNotice("")} aria-label={t("viewer.toast.close")}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          )}
          {flash && (
            <div className="vx-toast vx-toast--done" role="status">
              <CircleCheck size={16} aria-hidden="true" />
              {flash}
            </div>
          )}
          {selected && viewerNotice && (
            <div className="vx-toast vx-toast--notice" role="status">
              <CircleAlert size={16} aria-hidden="true" />
              {viewerNotice}
            </div>
          )}
          {/* Demo has no tiles: a hatched stand-in marks where the result layer would be. */}
          {useMockApi && selected && selectedResult && resultTime && ((resultVisible && !aiCompare) || (aiCompare && displayMode === "swipe")) && (
            <div
              className="vx-result-clip"
              style={aiCompare ? { clipPath: `inset(0 0 0 ${swipe}%)` } : undefined}
              aria-hidden="true"
            >
              <div className="result-overlay" style={{ opacity: resultOpacity / 100 }} />
            </div>
          )}
          {compareActive && (
            <CompareTargetSwitch
              value={aiCompare ? "ai" : "time"}
              onChange={(value) => {
                setCompareTarget(value);
                if (value === "ai") setResultVisible(true);
              }}
              aiAvailable={readyEntries.length > 0}
            />
          )}
          {/* Legends stack bottom-left in one place (UX2): drawn area, AI result, comparison classes, source colour bar. */}
          {/* CMP2: the comparison on the map — what, when, and how to turn it off. */}
          {shownComparison && <ComparisonBanner item={shownComparison} labelOf={labelOf} onOff={comparisonOff} />}
          {selected && (
            <div className="vx-legends">
              {shownComparison && <ComparisonMapLegend key={shownComparison.id} item={shownComparison} />}
              {area.shape && !area.drawing && (
                <div className="vx-legend" role="group" aria-label={t("viewer.stats.legendAria", { area: legendValue(area.shape.areaKm2, lang) })}>
                  <span className="vx-legend__row"><i className="vx-shape__swatch" aria-hidden="true" /><strong>{t("viewer.stats.legend")}</strong></span>
                  <small className="tabular">{`${legendValue(area.shape.areaKm2, lang)} km²`}</small>
                </div>
              )}
              {selectedResult && (resultVisible || aiCompare) && !(aiCompare && displayMode === "swipe") && (
                <AiLegend
                  entry={selectedResult}
                  timeLabel={times[timeIndex]?.label}
                  covered={!!resultTime}
                  publishing={resultPublishing}
                />
              )}
              {showsClasses && comparison && sourceVisible && <ComparisonLegend info={comparison} timeLabel={times[timeIndex]?.label} />}
              {activeVariable && sourceVisible && !showsClasses && (
                <SourceLegend variable={activeVariable} style={variableStyle} rgbBands={rgbBands} />
              )}
            </div>
          )}
          {pixel && <PixelMarker map={map} coordinate={pixel} />}
          {compareActive && displayMode === "swipe" && (
            <SwipeDivider
              value={swipe}
              onChange={changeSwipe}
              leftLabel={times[timeIndex]?.label ?? "—"}
              rightLabel={(aiCompare ? times[timeIndex]?.label : times[compareIndex]?.label) ?? "—"}
              target={aiCompare ? "ai" : "time"}
            />
          )}
          {splitActive && (
            <>
              <span className="vx-maplabel vx-maplabel--a vx-split-label">
                {aiCompare ? (
                  <>
                    <i className="vx-swatch vx-swatch--source" aria-hidden="true" />
                    <span>{t("viewer.compare.source")} <span className="tabular">{times[timeIndex]?.label ?? "—"}</span></span>
                  </>
                ) : (
                  <>
                    <b className="vx-flag">A</b>
                    <span className="tabular">{times[timeIndex]?.label ?? "—"}</span>
                  </>
                )}
              </span>
              <CompareMap
                mainMap={map}
                baseVisible={baseVisible}
                onMapReady={setCompareMap}
                label={(aiCompare ? times[timeIndex]?.label : times[compareIndex]?.label) ?? "—"}
                target={aiCompare ? "ai" : "time"}
              >
                {useMockApi && aiCompare && resultTime && (
                  <div className="vx-result-clip" aria-hidden="true">
                    <div className="result-overlay" style={{ opacity: resultOpacity / 100 }} />
                  </div>
                )}
              </CompareMap>
            </>
          )}
        </section>

        {/* UX2: the tool rail — the tabs of the one tool panel, named in words. A second press closes the panel. */}
        <nav className="vx-rail" aria-label={t("viewer.tools.aria")}>
          {TOOLS.map((tool) => {
            const Icon = TOOL_ICON[tool];
            const reason = toolDisabled(tool);
            const open = drawer === tool;
            return (
              <button
                key={tool}
                ref={(node) => {
                  railRefs.current[tool] = node;
                }}
                type="button"
                className="vx-rail__tool"
                data-tour={tool === "layers" ? "layers" : tool === "ai" ? "ai" : undefined}
                aria-expanded={open}
                aria-controls={open ? "vx-drawer" : undefined}
                aria-disabled={reason ? "true" : undefined}
                aria-describedby={reason ? `vx-rail-why-${tool}` : undefined}
                title={reason ?? t(`viewer.tools.${tool}Title`)}
                onClick={() => {
                  if (reason) {
                    // VX1: say why, next to the rail, with the next step (instead of a press that does nothing).
                    setRailTip((current) => (current?.tool === tool ? null : { tool, reason }));
                    return;
                  }
                  setRailTip(null);
                  if (tool === "result") {
                    // 결과 비교 is also the switch for seeing the AI result (UX13B): closing it hides the AI water layer
                    // (and leaves the AI-result comparison), opening it shows the layer again.
                    if (open) closeRightPanel();
                    else {
                      if (hasInference) setResultVisible(true);
                      // Comparisons made meanwhile (S9 in another tab) show up when the panel opens.
                      if (comparisonOrigin) setComparisonTick((value) => value + 1);
                      openRightPanel("result", true);
                    }
                    return;
                  }
                  toggleRightPanel(tool);
                }}
              >
                <Icon size={18} aria-hidden="true" />
                <span className="vx-rail__label">{t(`viewer.tools.${tool}`)}</span>
                {tool === "ai" && isRunning(aiRunHere) && <i className="vx-pulse" aria-hidden="true" />}
                {tool === "result" && (hasInference || comparisonList.length > 0) && (
                  <span className="vx-rail__count tabular" aria-label={t("viewer.tools.resultCounts", { ai: readyEntries.length, cmp: comparisonList.length })}>
                    {readyEntries.length + comparisonList.length}
                  </span>
                )}
                {tool === "result" && hasNewComparison && <i className="vx-rail__new" role="img" aria-label={t("viewer.tools.newResult")} />}
              </button>
            );
          })}
          {TOOLS.map((tool) => {
            const reason = toolDisabled(tool);
            return reason ? <span key={tool} id={`vx-rail-why-${tool}`} className="vx-sr">{reason}</span> : null;
          })}
        </nav>
        {railTip && (
          <div
            className="vx-railtip"
            role="status"
            style={{ "--vx-tip-top": `${railRefs.current[railTip.tool]?.offsetTop ?? 8}px` } as CSSProperties}
          >
            <p>
              <strong>{t(`viewer.tools.full.${railTip.tool}`)}</strong>
              {railTip.reason}
            </p>
            <div className="vx-railtip__actions">
              {!selected && (
                <button
                  type="button"
                  className="vx-btn vx-btn--ink"
                  onClick={() => {
                    setRailTip(null);
                    setPickerRequest((value) => value + 1);
                  }}
                >
                  {t("viewer.vx.railTipPick")}
                </button>
              )}
              <button type="button" className="vx-icon-btn" aria-label={t("viewer.vx.railTipClose")} title={t("viewer.vx.railTipClose")} onClick={() => setRailTip(null)}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
        {drawer && (
          <aside
            ref={drawerBoxRef}
            id="vx-drawer"
            className={`vx-drawer vx-drawer--${drawer} ${sheetFull ? "is-full" : ""}`}
            aria-labelledby="vx-drawer-title"
            aria-describedby="vx-drawer-lead"
            onKeyDown={(event) => {
              if (event.key !== "Escape" || event.defaultPrevented) return;
              event.preventDefault();
              // Esc while drawing cancels only the drawing (S7), not the whole panel.
              if (area.drawing) area.cancel();
              else requestClose();
            }}
          >
            <div className="vx-drawer__head">
              {/* VX1: on phones the sheet has two heights; a press (not a drag) switches them. */}
              <button
                type="button"
                className="vx-sheet-grip"
                aria-pressed={sheetFull}
                aria-label={t(sheetFull ? "viewer.vx.shrink" : "viewer.vx.grow")}
                title={t(sheetFull ? "viewer.vx.shrink" : "viewer.vx.grow")}
                onClick={() => setSheetFull((value) => !value)}
              >
                <i aria-hidden="true" />
              </button>
              <div>
                <h2 id="vx-drawer-title" ref={drawerTitleRef} tabIndex={-1}>{t(`viewer.tools.full.${drawer}`)}</h2>
                <p id="vx-drawer-lead">{drawer === "ai" && isRunning(aiRunHere) ? t("viewer.drawer.running") : t(`viewer.vx.lead.${drawer}`)}</p>
              </div>
              <button
                type="button"
                className="vx-btn vx-btn--quiet vx-drawer__close"
                onClick={requestClose}
                aria-label={t("viewer.drawer.close")}
                title={t("viewer.drawer.closeTitle")}
              >
                <X size={16} aria-hidden="true" />
                <span className="vx-hide-sm">{t("common.close")}</span>
              </button>
            </div>
            <div className="vx-drawer__body" ref={drawerBodyRef}>
              {drawer === "layers" && (
                <div id="vx-panel-body">
                  {!selected && <p className="vx-section__hint vx-form__pad">{t("viewer.panel.pickFirstLayers")}</p>}
                  {selected && (
                    <section className="vx-section">
                      <h3 className="vx-section__title">{t("viewer.panel.bands")}</h3>
                      <div className="vx-chips">
                        {hasRgb && (
                          <button type="button" aria-pressed={activeVariable === "rgb"} className={activeVariable === "rgb" ? "active" : ""} onClick={() => chooseLayer("rgb")}>
                            RGB
                          </button>
                        )}
                        {selected.variables.map((variable) => (
                          <button type="button" key={variable} aria-pressed={activeVariable === variable} className={activeVariable === variable ? "active" : ""} onClick={() => chooseLayer(variable)}>
                            {variable}
                          </button>
                        ))}
                      </div>
                      {activeVariable === "rgb" && <p className="vx-section__hint">{t("viewer.panel.rgbHint")}</p>}
                    </section>
                  )}
                  <section className="vx-section">
                    <h3 className="vx-section__title">{t("viewer.panel.layers")}</h3>
                    <div className="vx-layers">
                      {hasInference && (
                        <LayerControl label={t("viewer.panel.aiResult")} accent="result" checked={resultVisible} onChecked={setResultVisible} opacity={resultOpacity} onOpacity={setResultOpacity} />
                      )}
                      {selected && (
                        <LayerControl
                          label={t(selected.kind === "COMPARISON" ? "viewer.panel.comparison" : "viewer.panel.source")}
                          accent="source"
                          swatch={activeVariable ? swatchBackground(activeVariable, showsClasses ? tileStyle?.cmap : variableStyle?.colorBarName) : undefined}
                          checked={sourceVisible}
                          onChecked={setSourceVisible}
                          opacity={sourceOpacity}
                          onOpacity={setSourceOpacity}
                        />
                      )}
                      <div className="vx-layer-row">
                        <label className="vx-layer">
                          <input type="checkbox" checked={baseVisible} onChange={(e) => setBaseVisible(e.target.checked)} />
                          <i className="vx-swatch vx-swatch--base" aria-hidden="true" />
                          <span>{t("viewer.panel.basemap")}</span>
                        </label>
                      </div>
                    </div>
                  </section>
                  {selected && (
                    <section className="vx-section">
                      <PanelMore summary={t("viewer.vx.layers.info")} hint={t("viewer.panel.count", { count: times.length })}>
                      <dl className="vx-meta">
                        <div>
                          <dt>{t("viewer.panel.name")}</dt>
                          <dd title={selected.name}>{selected.name}</dd>
                        </div>
                        <div>
                          <dt>{t("viewer.panel.times")}</dt>
                          <dd className="tabular">{t("viewer.panel.count", { count: times.length })}</dd>
                        </div>
                        {times.length > 0 && (
                          <div>
                            <dt>{t("viewer.panel.period")}</dt>
                            <dd className="tabular">{t("viewer.panel.periodValue", { start: times[0]?.label, end: times[times.length - 1]?.label })}</dd>
                          </div>
                        )}
                        <div>
                          <dt>{t("viewer.panel.bandCount")}</dt>
                          <dd className="tabular">{t("viewer.panel.count", { count: selected.variables.length })}</dd>
                        </div>
                        <div>
                          <dt>{t("viewer.panel.crs")}</dt>
                          <dd>EPSG:4326</dd>
                        </div>
                      </dl>
                      </PanelMore>
                    </section>
                  )}
                </div>
              )}
              {selected && visited.includes("area") && (
                <div hidden={drawer !== "area"}>
                  {/* Keyed by dataset: settings, answers and requests of the previous dataset do not carry over (FIX4). */}
                  <AreaStatsPanel
                    key={selected.id}
                    targets={areaTargets}
                    times={times}
                    currentIndex={timeIndex}
                    onTimeIndex={(value) => {
                      setTimeIndex(value);
                      setPlaying(false);
                    }}
                    shape={area.shape}
                    drawing={area.drawing}
                    canDraw={area.available}
                    onDraw={startDraw}
                    onCancelDraw={area.cancel}
                    onUseView={areaFromView}
                    onClear={area.clear}
                    fileBase={selected.name}
                  />
                </div>
              )}
              {drawer === "ai" && selected && (
                <>
                  <AiRunForm dataset={selected} times={times} run={aiRunHere} runError={aiRunError} starting={aiStarting} onRun={startAi} onCancel={cancelAi} onRetry={retryAi} onShowResult={showRunResult} />
                  <section className="vx-section vx-section--top" aria-label={t("viewer.panel.aiResults")}>
                    <PanelMore summary={t("viewer.vx.ai.listGroup", { count: entries.length })}>
                      {jobsError && <p className="vx-section__hint" role="status">{t("viewer.panel.linkedError", { error: jobsError })}</p>}
                      <AiResultList entries={entries} selectedKey={resultKey} onMap={!!selectedResult && (resultVisible || aiCompare)} onSelect={chooseResult} />
                    </PanelMore>
                  </section>
                </>
              )}
              {drawer === "result" && selected && (
                <>
                  {!comparison && comparisonOrigin && (
                    <nav className="vx-ressum" aria-label={t("viewer.vx.result.summaryAria")}>
                      <p className="tabular">{t("viewer.vx.result.summary", { ai: readyEntries.length, cmp: comparisonList.length })}</p>
                      <div>
                        <button type="button" className="vx-btn vx-btn--quiet" onClick={() => jumpTo("vx-ai-results-title")}>{t("viewer.vx.result.toAi")}</button>
                        <button type="button" className="vx-btn vx-btn--quiet" onClick={() => jumpTo("vx-cmps-title")}>{t("viewer.vx.result.toCmp")}</button>
                      </div>
                    </nav>
                  )}
                  {!comparison && (
                    <h3 className="vx-resgroup__head" id="vx-ai-results-title" tabIndex={-1}>{t("viewer.cmps.aiGroup")}</h3>
                  )}
                  {comparison ? (
                    <ComparisonPanel info={comparison} labelOf={labelOf} datasetName={selected.name} />
                  ) : selectedResult ? (
                    <>
                      {readyEntries.length === 1 && (
                        <p className="vx-resname vx-form__pad" title={`${selectedResult.name} · ${entryDetail(selectedResult, lang)}`}>
                          <strong>{selectedResult.name}</strong>
                          <small className="tabular">{entryDetail(selectedResult, lang)}</small>
                        </p>
                      )}
                      {readyEntries.length > 1 && (
                        <label className="vx-field vx-form__pad">
                          <span>{t("viewer.drawer.pickResult")}</span>
                          <select aria-label={t("viewer.drawer.pickResultAria")} value={resultKey} onChange={(event) => setResultKey(event.target.value)}>
                            {readyEntries.map((entry) => (
                              <option key={entry.key} value={entry.key}>{`${entry.name} · ${entryDetail(entry, lang)}`}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      <AiResultPanel
                        entry={selectedResult}
                        result={resultStats}
                        loading={resultStatsLoading}
                        currentTime={times[timeIndex]?.iso}
                        currentLabel={times[timeIndex]?.label}
                        labelOf={labelOf}
                        source={selected}
                        resultVisible={resultVisible}
                        onResultVisible={setResultVisible}
                        resultOpacity={resultOpacity}
                        onResultOpacity={setResultOpacity}
                        sourceVisible={sourceVisible}
                        onSourceVisible={setSourceVisible}
                        sourceOpacity={sourceOpacity}
                        onSourceOpacity={setSourceOpacity}
                        onRerun={selectedResult.job?.input?.modelId ? rerunAi : undefined}
                        rerunBusy={isRunning(aiRun)}
                        demo={useMockApi}
                        onSwipe={times.length > 0 ? toggleAiSwipe : undefined}
                        swiping={aiCompare && displayMode === "swipe"}
                      />
                    </>
                  ) : (
                    <p className="vx-section__hint vx-form__pad">{t(selected.kind === "AI_RESULT" ? "viewer.drawer.noResult" : "viewer.drawer.noResultYet")}</p>
                  )}
                  {comparisonOrigin ? (
                    <ComparisonGroup
                      items={comparisonItems}
                      shownId={shownComparisonId}
                      canDelete={canDeleteComparison}
                      labelOf={labelOf}
                      onShow={toggleComparison}
                      onDelete={deleteComparison}
                      resultId={resultDatacubeId ?? readyEntries.find((entry) => entry.datacubeId)?.datacubeId}
                      onGoAi={() => openRightPanel("ai", true)}
                    />
                  ) : (
                    <CompareEntry
                      source={comparison ? comparison.sourceDatacubeId : selected.id}
                      result={comparison ? comparison.resultId ?? comparison.aId : resultDatacubeId}
                      time={times[timeIndex]?.iso}
                    />
                  )}
                </>
              )}
              {selected && visited.includes("export") && (
                <div hidden={drawer !== "export"}>
                  <ExportPanel key={selected.id} targets={exportTargets} times={times} currentIndex={timeIndex} shape={area.shape} viewBbox={mapExtent4326} datasetName={selected.name} onPng={makePng} onRunningChange={onExportRunning} />
                </div>
              )}
            </div>
          </aside>
        )}
        {exportLeave && (
          <Dialog
            role="alertdialog"
            size="sm"
            title={t("viewer.uxf.exportLeave.title", { count: exportLeave.length })}
            description={t("viewer.uxf.exportLeave.text")}
            onClose={() => setExportLeave(null)}
            footer={
              <>
                <Button variant="line" onClick={() => void leaveExports(false)}>{t("viewer.uxf.exportLeave.keep")}</Button>
                <Button variant="danger" onClick={() => void leaveExports(true)}>{t("viewer.uxf.exportLeave.cancel")}</Button>
              </>
            }
          />
        )}
      </div>

      {selected && (
        <div className={`vx-dock ${compareActive ? "is-compare" : ""}`}>
          {pixel && (
            <BottomGraphPanel
              expanded={graphExpanded}
              onToggle={() => setGraphExpanded((value) => !value)}
              dataset={selected}
              variable={activeVariable}
              points={seriesPoints}
              coordinate={pixelLonLat}
              currentTime={times[timeIndex]?.iso}
              currentLabel={times[timeIndex]?.label}
              timeCount={times.length}
              compareTime={compareActive && !aiCompare ? times[compareIndex]?.iso : undefined}
              compareLabel={compareActive && !aiCompare ? times[compareIndex]?.label : undefined}
              announce={!playing}
            />
          )}
          {selectedResult && resultStats && resultStats.times.length > 0 && (resultVisible || aiCompare) && (
            <WaterAreaRow
              result={resultStats}
              times={times}
              index={timeIndex}
              onIndex={(value) => {
                setTimeIndex(value);
                setPlaying(false);
              }}
              expanded={areaExpanded}
              onToggle={() => setAreaExpanded((value) => !value)}
              title={selectedResult.name}
            />
          )}
          <section
            className="vx-timeline"
            aria-label={t("viewer.dock.timeline")}
            data-tour="timeline"
          >
            <div className="vx-timeline__lead">
              <div className="vx-player">
                <button
                  type="button"
                  className="vx-icon-btn"
                  onClick={() => setTimeIndex(Math.max(0, timeIndex - 1))}
                  aria-label={t("viewer.dock.prev")}
                  title={t("viewer.dock.prevTitle")}
                >
                  <ChevronLeft size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="vx-play"
                  onClick={() => setPlaying(canPlay && !playing)}
                  disabled={!canPlay}
                  aria-label={t(!canPlay ? "viewer.dock.playDisabled" : playing ? "viewer.dock.pause" : "viewer.dock.play")}
                  aria-pressed={canPlay && playing}
                  title={t(!canPlay ? "viewer.dock.playDisabledTitle" : playing ? "viewer.dock.pauseTitle" : "viewer.dock.playTitle")}
                >
                  {playing ? (
                    <Pause size={16} aria-hidden="true" />
                  ) : (
                    <Play size={16} aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  className="vx-icon-btn"
                  onClick={() =>
                    setTimeIndex(Math.min(times.length - 1, timeIndex + 1))
                  }
                  aria-label={t("viewer.dock.next")}
                  title={t("viewer.dock.nextTitle")}
                >
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>
              <div className="vx-current">
                <strong className="tabular">
                  {compareActive && !aiCompare && (
                    <b className="vx-flag" aria-hidden="true">
                      A
                    </b>
                  )}
                  {times[timeIndex]?.label ?? t("viewer.dock.noTime")}
                  {/* Always present so screen readers hear it appear; silent while playing (1.5 s steps). */}
                  <span className="vx-current__live" role="status" aria-live={playing ? "off" : "polite"}>
                    {waitShown && (
                      <span className="vx-current__wait">
                        <LoaderCircle size={12} className="vx-spin" aria-hidden="true" />
                        <span className="vx-current__wait-text">{t("viewer.dock.waiting")}</span>
                      </span>
                    )}
                  </span>
                </strong>
                {aiCompare ? (
                  <span className="vx-btime vx-btime--ai">
                    <i className="vx-hatch" aria-hidden="true" />
                    {t("viewer.dock.aiCompare")}
                  </span>
                ) : compareActive ? (
                  <CompareTime
                    times={times}
                    compareIndex={compareIndex}
                    onCompareIndex={setCompareIndex}
                  />
                ) : null}
                <small className="tabular vx-current__count">
                  {times.length ? `${timeIndex + 1} / ${times.length}` : t("viewer.dock.noTime")}
                </small>
              </div>
            </div>
            <TimeStaff
              times={times}
              index={timeIndex}
              onIndex={(value) => {
                setTimeIndex(value);
                setPlaying(false);
              }}
              compareIndex={compareActive && !aiCompare ? compareIndex : -1}
            />
            <div className="vx-timeline__tail">
              <CompareModes
                mode={displayMode}
                onMode={changeDisplayMode}
                disabled={!canCompare}
              />
              <PlaybackOptions
                speed={speed}
                onSpeed={setSpeed}
                loop={loop}
                onLoop={setLoop}
                onFirst={() => setTimeIndex(0)}
                onLast={() => setTimeIndex(times.length - 1)}
              />
            </div>
          </section>
        </div>
      )}
      {tourOpen && (
        <ViewerTour
          onClose={() => {
            setTourOpen(false);
            // FIX4: focus goes back to the help button instead of being lost with the tour card.
            focusNextRef.current = () => tourButtonRef.current;
          }}
        />
      )}
    </main>
  );
}
