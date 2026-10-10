import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  Crosshair,
  Hand,
  Layers,
  Layers2,
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
import { BottomGraphPanel, PixelMarker } from "./PixelGraph";
import DatasetPicker from "./DatasetPicker";
import LayerControl from "./LayerControl";
import SourceLegend from "./SourceLegend";
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
import { ai, formatDate } from "../../app/api";
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

type Drawer = "ai" | "result" | null;
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

/** AI service jobs first; Backoffice links (older results) only when no job already points at them. */
function resultEntries(aiJobs: AiWaterJob[], linked: AiJob[], lang: Lang): ResultEntry[] {
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
    if (link.outputDatacubeId && !entries.some((entry) => entry.datacubeId === link.outputDatacubeId))
      entries.push({ key: `link:${link.outputDatacubeId}`, name: translate(lang, "viewer.ai.list.linkedName", { id: link.id }), status: link.status, datacubeId: link.outputDatacubeId });
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
  };
}
/** Keys typed into fields, buttons and dialogs keep their own meaning. */
function ownsKeys(target: EventTarget | null, key: string) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const fields = "input, textarea, select, [role='slider'], [role='combobox'], [role='listbox'], [role='dialog'], [role='menu'], [role='tablist']";
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [datasets, setDatasets] = useState<ZarrDataset[]>([]);
  const [projectDatasets, setProjectDatasets] = useState<ZarrDataset[]>([]);
  const [datasetId, setDatasetId] = useState("");
  // The layer panel starts open on wide screens (S7) and collapsed on narrow ones.
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 1280);
  const [flash, setFlash] = useState("");
  const [notice, setNotice] = useState("");
  const [noDataHidden, setNoDataHidden] = useState(false);
  const [pickHintHidden, setPickHintHidden] = useState(false);
  const [tourOpen, setTourOpen] = useState(
    () => onboarding && !tourDismissed(),
  );
  const [tab, setTab] = useState<"layers" | "jobs">("layers");
  const [drawer, setDrawer] = useState<Drawer>(null);
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
  const [resultKey, setResultKey] = useState("");
  const wantedResultRef = useRef<string | undefined>(
    new URLSearchParams(window.location.search).get("ai") ?? undefined,
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
  const [xcubeConnected, setXcubeConnected] = useState<boolean | null>(null);
  const [jobsFailure, setJobsError] = useState<unknown>(null);
  const jobsError = jobsFailure ? userMessage(jobsFailure, lang) : "";
  const [mapTool, setMapTool] = useState<MapTool>("pan");
  const [pixelTip, setPixelTip] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [graphExpanded, setGraphExpanded] = useState(true);
  const [pickerRequest, setPickerRequest] = useState(0);
  // Keyboard pixel query: a reticle moved with the arrow keys, queried with Enter.
  const mapBoxRef = useRef<HTMLElement>(null);
  /** Bottom-left legend stack; the layer sheet stops above it so the legend is never hidden (S7). */
  const legendsRef = useRef<HTMLDivElement>(null);
  const aiStartingRef = useRef(false);
  const [aiStarting, setAiStarting] = useState(false);
  const [legendSpace, setLegendSpace] = useState(0);
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
  const tileStyle = useMemo(() => {
    if (!styleKey) return undefined;
    const [cmap, vmin, vmax] = styleKey.split("|");
    return { cmap: cmap && cmap !== "undefined" ? cmap : undefined, vmin: vmin === "undefined" ? undefined : Number(vmin), vmax: vmax === "undefined" ? undefined : Number(vmax) };
  }, [styleKey]);
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
      ),
    [aiJobs, jobs, selected?.id, lang],
  );
  const readyEntries = useMemo(
    () => entries.filter((entry) => entry.status === "SUCCEEDED" && (!!entry.datacubeId || !!entry.job?.result)),
    [entries],
  );
  const selectedResult = readyEntries.find((entry) => entry.key === resultKey) ?? null;
  const hasInference = !!selected && readyEntries.length > 0;
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
  const hasRgb = useMemo(
    () =>
      selected?.rgbAvailable === true ||
      ["red", "green", "blue"].every((band) =>
        selected?.variables.some((variable) => variable.toLowerCase() === band),
      ),
    [selected],
  );
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
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
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
          setDatasets((current) =>
            items.map(
              (item) => current.find((known) => known.id === item.id) ?? item,
            ),
          ),
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
    setResultKey((current) =>
      readyEntries.some((entry) => entry.key === current) ? current : readyEntries[0]?.key ?? "",
    );
  }, [readyEntries]);
  const selectedResultKey = selectedResult?.key;
  const selectedResultJob = selectedResult?.job;
  useEffect(() => {
    setResultStats(selectedResultJob?.result ?? null);
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
  }, [selectedResultKey, selectedResultJob]);
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
  useEffect(() => {
    // Preselect the dataset passed in the URL once, after the list arrives.
    if (initialAppliedRef.current || !initialDatasetId || !datasets.length) return;
    initialAppliedRef.current = true;
    if (datasets.some((item) => item.id === initialDatasetId))
      setDatasetId(initialDatasetId);
  }, [datasets, initialDatasetId]);
  useEffect(() => {
    setTimeIndex(0);
    setPixel(null);
    setPlaying(false);
    setActiveVariable("");
    detailLoadedRef.current = "";
    setCompareIndex(-1);
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
    if (pending.variable && (pending.variable === "rgb" || selected.variables.includes(pending.variable))) {
      setActiveVariable(pending.variable);
      next.variable = undefined;
    }
    if (times.length) {
      const a = pending.time ? times.findIndex((time) => time.iso === pending.time) : -1;
      if (a >= 0) setTimeIndex(a);
      const b = pending.compare ? times.findIndex((time) => time.iso === pending.compare) : -1;
      if (pending.mode && (times.length > 1 || pending.target === "ai")) {
        setDisplayMode(pending.mode);
        setCompareIndex(b >= 0 ? b : a > 0 ? a - 1 : 1);
        if (pending.target === "ai") setCompareTarget("ai");
      }
      next.time = next.compare = next.mode = next.target = undefined;
    }
    urlStateRef.current = next;
  }, [selected, times]);
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
    if (datasetId && resultKey && !resultKey.startsWith("link:")) params.set("ai", resultKey);
    else if (datasetId && selectedResult?.datacubeId) params.set("ai", selectedResult.datacubeId);
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`)
      window.history.replaceState(window.history.state, "", next);
  }, [loading, initialDatasetId, datasetId, projectId, activeVariable, times, timeIndex, displayMode, compareIndex, aiCompare, resultKey, selectedResult?.datacubeId]);
  // ←/→ step through times, Space plays or pauses, unless a field, button or dialog has focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (tourOpen || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      if (ownsKeys(event.target, event.key) || document.querySelector("[role='dialog'][aria-modal='true']")) return;
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
        setActiveVariable((current) => current || resolved.defaultVariable);
        setViewerNotice(null);
      })
      .catch((cause) => setViewerNotice({ cause }));
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
  useEffect(() => {
    if (selected && !canCompare && displayMode !== "single") setDisplayMode("single");
  }, [selected, canCompare, displayMode]);
  useEffect(() => {
    // With a single time the only comparison is 원본 ↔ AI 결과.
    if (times.length < 2 && selectedResult && compareTarget !== "ai") setCompareTarget("ai");
  }, [times.length, selectedResult, compareTarget]);
  const onMapReady = useCallback((instance: Map) => setMap(instance), []);
  const openRightPanel = useCallback((type: Exclude<Drawer, null>) => {
    setDrawer(type);
    setRightCollapsed(false);
    if (window.innerWidth < 1180) setPanelOpen(false);
  }, []);
  const onPixelSelect = useCallback(
    async (coordinate: [number, number]) => {
      if (
        mapTool !== "pixel" ||
        !selected ||
        (!sourceVisible && !resultVisible)
      )
        return;
      setPixelTip(false);
      setPlaying(false);
      setViewerNotice(null);
      const lonLat = toLonLat(coordinate) as [number, number];
      setPixelLonLat({ lon: lonLat[0], lat: lonLat[1] });
      if (!useMockApi && (!activeVariable || activeVariable === "rgb")) {
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
        // An empty series is explained once, inside the reading row (no extra toast).
        if (!points.length) return;
        setSeriesPoints(points);
        setPixel(coordinate);
      } catch (cause) {
        setViewerNotice({ cause });
      }
    },
    [mapTool, selected, sourceVisible, resultVisible, times, activeVariable],
  );
  const selectMapTool = (tool: MapTool, fromKeyboard = false) => {
    setMapTool(tool);
    setPixelTip(tool === "pixel");
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
  const closeRightPanel = () => {
    setDrawer(null);
    setRightCollapsed(false);
  };
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
  const labelOf = (iso: string) => {
    const match = matchTime(times.map((time) => time.iso), iso);
    return times.find((time) => time.iso === match)?.label ?? iso;
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
  // Entry with datasets shows the map and one plain hint; the tour explains the rest.
  const emptyMessage = loading
    ? t("viewer.empty.loading")
    : apiError ||
      (datasets.length || noDataHidden
        ? ""
        : t("viewer.empty.noData"));
  const pickHint = !selected && !loading && !apiError && datasets.length > 0 && !pickHintHidden;
  // Keep the layer sheet's bottom above the legend stack: measure the stack (its size and its
  // compare-mode offset) and hand the space it takes to the sheet as --vx-legend-space.
  useEffect(() => {
    const legends = legendsRef.current;
    const box = mapBoxRef.current;
    if (!legends || !box) {
      setLegendSpace(0);
      return;
    }
    const measure = () => {
      const top = legends.getBoundingClientRect().top;
      const bottom = box.getBoundingClientRect().bottom;
      setLegendSpace(legends.childElementCount ? Math.max(0, Math.round(bottom - top)) : 0);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(legends);
    observer.observe(box);
    return () => observer.disconnect();
  }, [selected, compareActive, displayMode, panelOpen]);

  return (
    <main className="viewer vx" aria-label={t("viewer.top.main")}>
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
          {selected && selected.kind !== "AI_RESULT" && (
            <button
              type="button"
              className="vx-btn vx-btn--line"
              aria-label={t("viewer.top.ai")}
              title={t("viewer.top.ai")}
              data-tour="ai"
              aria-pressed={drawer === "ai"}
              onClick={() => openRightPanel("ai")}
            >
              <Waves size={16} aria-hidden="true" />
              <span className="vx-hide-sm">{t("viewer.top.ai")}</span>
            </button>
          )}
          {hasInference && (
            <button
              type="button"
              className="vx-btn vx-btn--line"
              aria-pressed={drawer === "result"}
              onClick={() => {
                setResultVisible(true);
                openRightPanel("result");
              }}
            >
              <Layers2 size={16} aria-hidden="true" />
              <span>{t("viewer.top.results")}</span>
            </button>
          )}
          <button
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

      <div
        style={{ "--vx-legend-space": `${legendSpace}px` } as React.CSSProperties}
        className={`vx-body ${panelOpen ? "panel-open" : ""} ${drawer && !rightCollapsed ? "drawer-open" : ""} ${drawer && rightCollapsed ? "rail-open" : ""}`}
      >
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
          />
          {!panelOpen && (
            <button
              type="button"
              className="vx-sheet-open"
              onClick={() => setPanelOpen(true)}
              data-tour="layers"
              aria-label={t("viewer.map.openSheet")}
              title={t("viewer.map.openSheetTitle")}
            >
              <Layers size={16} aria-hidden="true" />
              <span>{t("viewer.panel.layers")}</span>
            </button>
          )}
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
              {!loading && !apiError && (
                <a
                  className="vx-btn vx-btn--ink"
                  href="/app/data/new"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Plus size={16} aria-hidden="true" />
                  {t("viewer.top.addData")}
                </a>
              )}
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
            <div className="vx-toast vx-toast--notice" role="alert">
              <CircleAlert size={16} aria-hidden="true" />
              {notice}
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
          {/* Legends stack bottom-left: the source colour bar, and the AI result above it when shown (S7). */}
          {selected && (
            <div className="vx-legends" ref={legendsRef}>
              {selectedResult && (resultVisible || aiCompare) && !(aiCompare && displayMode === "swipe") && (
                <AiLegend
                  entry={selectedResult}
                  timeLabel={times[timeIndex]?.label}
                  covered={!!resultTime}
                  publishing={resultPublishing}
                />
              )}
              {activeVariable && sourceVisible && (
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

        {panelOpen && (
          <aside
            className="vx-panel"
            aria-label={t("viewer.panel.aria")}
            data-tour="layers"
          >
            <div className="vx-panel__head">
              <div className="vx-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "layers"}
                  onClick={() => setTab("layers")}
                >
                  {t("viewer.panel.layers")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "jobs"}
                  onClick={() => setTab("jobs")}
                >
                  {t("viewer.panel.aiJobs")}
                  {entries.length > 0 && (
                    <span className="vx-count tabular">{entries.length}</span>
                  )}
                </button>
              </div>
              <button
                type="button"
                className="vx-icon-btn"
                onClick={() => setPanelOpen(false)}
                aria-label={t("viewer.panel.close")}
                title={t("viewer.panel.collapse")}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            {tab === "layers" ? (
              <div className="vx-panel__body">
                {selected && (
                  <section className="vx-section">
                    <h2 className="vx-section__title">{t("viewer.panel.bands")}</h2>
                    <div className="vx-chips">
                      {hasRgb && (
                        <button
                          type="button"
                          aria-pressed={activeVariable === "rgb"}
                          className={activeVariable === "rgb" ? "active" : ""}
                          onClick={() => setActiveVariable("rgb")}
                        >
                          RGB
                        </button>
                      )}
                      {selected.variables.map((variable) => (
                        <button
                          type="button"
                          key={variable}
                          aria-pressed={activeVariable === variable}
                          className={
                            activeVariable === variable ? "active" : ""
                          }
                          onClick={() => setActiveVariable(variable)}
                        >
                          {variable}
                        </button>
                      ))}
                    </div>
                    {activeVariable === "rgb" && (
                      <p className="vx-section__hint">
                        {t("viewer.panel.rgbHint")}
                      </p>
                    )}
                  </section>
                )}
                <section className="vx-section">
                  <h2 className="vx-section__title">{t("viewer.panel.layers")}</h2>
                  <div className="vx-layers">
                    {hasInference && (
                      <LayerControl
                        label={t("viewer.panel.aiResult")}
                        accent="result"
                        checked={resultVisible}
                        onChecked={setResultVisible}
                        opacity={resultOpacity}
                        onOpacity={setResultOpacity}
                      />
                    )}
                    {selected && (
                      <LayerControl
                        label={t("viewer.panel.source")}
                        accent="source"
                        checked={sourceVisible}
                        onChecked={setSourceVisible}
                        opacity={sourceOpacity}
                        onOpacity={setSourceOpacity}
                      />
                    )}
                    <div className="vx-layer-row">
                      <label className="vx-layer">
                        <input
                          type="checkbox"
                          checked={baseVisible}
                          onChange={(e) => setBaseVisible(e.target.checked)}
                        />
                        <i className="vx-swatch vx-swatch--base" aria-hidden="true" />
                        <span>{t("viewer.panel.basemap")}</span>
                      </label>
                    </div>
                  </div>
                </section>
                {selected && (
                  <section className="vx-section">
                    <h3 className="vx-section__title">{t("viewer.panel.info")}</h3>
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
                          <dd className="tabular">
                            {t("viewer.panel.periodValue", { start: times[0]?.label, end: times[times.length - 1]?.label })}
                          </dd>
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
                  </section>
                )}
              </div>
            ) : (
              <div className="vx-panel__body">
                <section className="vx-section">
                  <h2 className="vx-section__title">{t("viewer.panel.aiResults")}</h2>
                  {jobsError && (
                    <p className="vx-section__hint" role="status">
                      {t("viewer.panel.linkedError", { error: jobsError })}
                    </p>
                  )}
                  {selected ? (
                    <AiResultList entries={entries} selectedKey={resultKey} onMap={!!selectedResult && (resultVisible || aiCompare)} onSelect={chooseResult} />
                  ) : (
                    <p className="vx-section__hint">{t("viewer.panel.pickFirst")}</p>
                  )}
                </section>
              </div>
            )}
          </aside>
        )}

        {drawer && rightCollapsed && (
          <aside className="vx-drawer-rail">
            <button
              type="button"
              onClick={() => setRightCollapsed(false)}
              aria-label={t("viewer.drawer.open", { name: t(drawer === "ai" ? "viewer.drawer.aiTab" : "viewer.drawer.resultTab") })}
            >
              {drawer === "ai" ? (
                <Waves size={18} aria-hidden="true" />
              ) : (
                <Layers2 size={18} aria-hidden="true" />
              )}
            </button>
          </aside>
        )}
        {drawer && !rightCollapsed && (
          <aside
            className="vx-drawer"
            aria-label={t(drawer === "ai" ? "viewer.drawer.aiAria" : "viewer.drawer.resultAria")}
          >
            <div className="vx-drawer__head">
              <div>
                <h2>{t(drawer === "ai" ? "viewer.drawer.aiTitle" : "viewer.drawer.resultTitle")}</h2>
                <p title={drawer === "ai" ? selected?.name : selectedResult?.name}>
                  {drawer === "ai"
                    ? isRunning(aiRunHere)
                      ? t("viewer.drawer.running")
                      : selected?.name ?? t("viewer.drawer.newJob")
                    : selectedResult?.name ?? t("viewer.drawer.layersFallback")}
                </p>
              </div>
              <span>
                <button
                  type="button"
                  className="vx-icon-btn"
                  onClick={() => setRightCollapsed(true)}
                  aria-label={t("viewer.drawer.collapse")}
                  title={t("viewer.drawer.collapse")}
                >
                  <ChevronsRight size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="vx-icon-btn"
                  onClick={closeRightPanel}
                  aria-label={t("viewer.drawer.close")}
                  title={t("common.close")}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </span>
            </div>
            <div className="vx-tabs vx-tabs--full" role="tablist" aria-label={t("viewer.drawer.tabs")}>
              <button
                type="button"
                role="tab"
                aria-selected={drawer === "ai"}
                onClick={() => openRightPanel("ai")}
              >
                {t("viewer.drawer.aiTab")}
                {isRunning(aiRunHere) && (
                  <i className="vx-pulse" aria-hidden="true" />
                )}
              </button>
              {hasInference && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={drawer === "result"}
                  onClick={() => openRightPanel("result")}
                >
                  {t("viewer.drawer.resultTab")}
                </button>
              )}
            </div>
            <div className="vx-drawer__body" role="tabpanel">
              {drawer === "ai" && selected ? (
                <>
                  <AiRunForm
                    dataset={selected}
                    times={times}
                    run={aiRunHere}
                    runError={aiRunError}
                    starting={aiStarting}
                    onRun={startAi}
                    onCancel={cancelAi}
                    onRetry={retryAi}
                  />
                  <section className="vx-section vx-section--top">
                    <h3 className="vx-section__title">{t("viewer.panel.aiResults")}</h3>
                    <AiResultList entries={entries} selectedKey={resultKey} onMap={!!selectedResult && (resultVisible || aiCompare)} onSelect={chooseResult} />
                  </section>
                </>
              ) : drawer === "result" && selected && selectedResult ? (
                <>
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
                  />
                </>
              ) : (
                <p className="vx-section__hint vx-form__pad">{t("viewer.drawer.noResult")}</p>
              )}
            </div>
          </aside>
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
      {tourOpen && <ViewerTour onClose={() => setTourOpen(false)} />}
    </main>
  );
}
