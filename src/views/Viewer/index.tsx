import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map from "ol/Map";
import TileLayer from "ol/layer/Tile";
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
import { ai } from "../../app/api";
import type { AiJobRequest, AiResult, AiWaterJob } from "../../api/aiApi";
import {
  AiLegend,
  AiResultList,
  AiResultPanel,
  AiRunForm,
  isRunning,
  matchTime,
  ResultEntry,
  WaterAreaRow,
} from "./AiPanel";
import { PlaybackOptions, TimeStaff } from "./TimeStaff";
import UserMenu from "./UserMenu";

type Drawer = "ai" | "result" | null;
type MapTool = "pan" | "pixel";
const noop = () => undefined;
/** water_mask (1 물, 0 물 아님, 255 값 없음) in result teal; the _alpha map keeps "물 아님" transparent. */
// water_mask is 0/1: with vmax 1.6 a value of 1 lands mid-ramp (a clear teal) instead of the darkest green; 0 stays transparent.
const AI_MASK_STYLE = { cmap: "GnBu_alpha", vmin: 0, vmax: 1.6 };
/** Numeric catalog ids go to the services as numbers; demo ids stay strings. */
const cubeId = (id: string) => (/^\d+$/.test(id) ? Number(id) : id);

/** AI service jobs first; Backoffice links (older results) only when no job already points at them. */
function resultEntries(aiJobs: AiWaterJob[], linked: AiJob[]): ResultEntry[] {
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
  }));
  for (const link of linked)
    if (link.outputDatacubeId && !entries.some((entry) => entry.datacubeId === link.outputDatacubeId))
      entries.push({ key: `link:${link.outputDatacubeId}`, name: `수체 추출 결과 #${link.id}`, status: link.status, datacubeId: link.outputDatacubeId });
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
  const [resultOpacity, setResultOpacity] = useState(70);
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
  const [aiRunError, setAiRunError] = useState("");
  const [compareTarget, setCompareTarget] = useState<CompareTarget>("time");
  const [areaExpanded, setAreaExpanded] = useState(true);
  const [map, setMap] = useState<Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [viewerNotice, setViewerNotice] = useState("");
  const [seriesPoints, setSeriesPoints] = useState<SeriesPoint[]>([]);
  const [pixelLonLat, setPixelLonLat] = useState<{
    lon: number;
    lat: number;
  } | null>(null);
  const [activeVariable, setActiveVariable] = useState("");
  const [xcubeConnected, setXcubeConnected] = useState<boolean | null>(null);
  const [jobsError, setJobsError] = useState("");
  const [mapTool, setMapTool] = useState<MapTool>("pan");
  const [pixelTip, setPixelTip] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [graphExpanded, setGraphExpanded] = useState(true);
  const [pickerRequest, setPickerRequest] = useState(0);
  // Keyboard pixel query: a reticle moved with the arrow keys, queried with Enter.
  const mapBoxRef = useRef<HTMLElement>(null);
  const probeRef = useRef<HTMLButtonElement>(null);
  const focusProbeRef = useRef(false);
  const [probe, setProbe] = useState<[number, number] | null>(null);
  const urlStateRef = useRef<UrlState>(readUrlState());
  const [displayMode, setDisplayMode] = useState<DisplayMode>("single");
  const [compareIndex, setCompareIndex] = useState(-1);
  const [swipe, setSwipe] = useState(50);
  const swipeRef = useRef(50);
  const [compareMap, setCompareMap] = useState<Map | null>(null);
  const sourceLayer = useRef<TileLayer<any> | null>(null);
  const sourceVisibleRef = useRef(sourceVisible);
  const sourceOpacityRef = useRef(sourceOpacity);
  const detailLoadedRef = useRef("");
  const initialAppliedRef = useRef(false);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const selected = datasets.find((item) => item.id === datasetId) ?? null;
  const selectedId = selected?.id;
  const selectedXcubeDatasetId = selected?.xcubeDatasetId;
  const selectedBbox = selected?.bbox;
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
      ),
    [aiJobs, jobs, selected?.id],
  );
  const readyEntries = useMemo(
    () => entries.filter((entry) => entry.status === "SUCCEEDED" && (!!entry.datacubeId || !!entry.job?.result)),
    [entries],
  );
  const selectedResult = readyEntries.find((entry) => entry.key === resultKey) ?? null;
  const hasInference = !!selected && readyEntries.length > 0;
  const times = useMemo(() => selected?.times ?? [], [selected]);
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
  const fail = useCallback(
    (cause: unknown) => {
      setApiError(userMessage(cause));
    },
    [],
  );
  const loadProjects = useCallback(() => {
    setLoading(true);
    setApiError("");
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
      setJobsError("");
      return;
    }
    setJobsError("");
    activeViewerAdapter
      .getJobs(datasetId)
      .then(setJobs)
      .catch((cause) => {
        setJobs([]);
        setJobsError(userMessage(cause));
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
  useEffect(() => {
    setResultCube(null);
    if (!resultCubeId || useMockApi) return;
    let cancelled = false;
    backofficeAdapter
      .getDatasetDetail(resultCubeId)
      .then((detail) => !cancelled && setResultCube(detail))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [resultCubeId]);
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
            setFlash("수체 추출이 끝났습니다. 결과를 원본 위에 겹쳐 보여 줍니다.");
          }
          setAiTick((value) => value + 1);
        })
        .catch((cause) => !cancelled && setAiRunError(userMessage(cause)));
    }, useMockApi ? 700 : 3000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
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
      setViewerNotice("");
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
        setViewerNotice("");
      })
      .catch((cause) => setViewerNotice(userMessage(cause)));
  }, [datasetId, selected]);
  useEffect(() => {
    if (!playing || times.length < 2) return;
    const timer = window.setInterval(
      () =>
        setTimeIndex((current) =>
          current === times.length - 1 ? (loop ? 0 : current) : current + 1,
        ),
      900 / speed,
    );
    return () => window.clearInterval(timer);
  }, [playing, speed, loop, times.length]);
  useEffect(() => {
    if (!loop && playing && timeIndex === times.length - 1) setPlaying(false);
  }, [timeIndex, times.length, loop, playing]);
  useEffect(() => {
    sourceVisibleRef.current = sourceVisible;
    sourceOpacityRef.current = sourceOpacity;
    sourceLayer.current?.setVisible(sourceVisible);
    sourceLayer.current?.setOpacity(sourceOpacity / 100);
  }, [sourceVisible, sourceOpacity]);
  useEffect(() => {
    if (!map) return;
    if (sourceLayer.current) {
      sourceLayer.current.get("cleanup")?.();
      map.removeLayer(sourceLayer.current);
      sourceLayer.current = null;
    }
    if (!selectedId) return;
    let cancelled = false;
    let effectLayer: TileLayer<any> | null = null;
    if (useMockApi || !activeVariable || !selectedXcubeDatasetId) return;
    addDynamicXcubeLayer({
      map,
      tileUrl:
        selectedTileBase || tileStyle
          ? backofficeAdapter.tileUrl(
              selectedXcubeDatasetId,
              activeVariable,
              times[timeIndex]?.iso,
              selectedTileBase,
              tileStyle,
            )
          : backofficeAdapter.tileUrl(
              selectedXcubeDatasetId,
              activeVariable,
              times[timeIndex]?.iso,
            ),
      bbox: selectedBbox,
      onError: fail,
    })
      .then((layer) => {
        if (!layer) return;
        if (cancelled) {
          layer.get("cleanup")?.();
          map.removeLayer(layer);
          return;
        }
        effectLayer = layer;
        sourceLayer.current = layer;
        layer.setVisible(sourceVisibleRef.current);
        layer.setOpacity(sourceOpacityRef.current / 100);
      })
      .catch(() => {
        /* Demo may run without XCube Server; OSM remains interactive. */
      });
    return () => {
      cancelled = true;
      if (effectLayer) {
        effectLayer.get("cleanup")?.();
        map.removeLayer(effectLayer);
        if (sourceLayer.current === effectLayer) sourceLayer.current = null;
      }
    };
  }, [
    map,
    selectedId,
    selectedXcubeDatasetId,
    selectedBbox,
    selectedTileBase,
    tileStyle,
    activeVariable,
    times,
    timeIndex,
    fail,
  ]);

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
    !useMockApi && resultXcubeId && resultTime
      ? backofficeAdapter.tileUrl(resultXcubeId, "water_mask", resultTime, resultCube?.tileBaseUrl, AI_MASK_STYLE)
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
      setViewerNotice("");
      const lonLat = toLonLat(coordinate) as [number, number];
      setPixelLonLat({ lon: lonLat[0], lat: lonLat[1] });
      if (!useMockApi && (!activeVariable || activeVariable === "rgb")) {
        setViewerNotice(
          activeVariable === "rgb"
            ? "RGB 합성 대신 개별 band를 선택하면 픽셀 시계열을 조회할 수 있습니다."
            : "조회 가능한 변수가 없습니다. 데이터 동기화 상태를 확인해 주세요.",
        );
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
        setViewerNotice(userMessage(cause));
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
    setAiRunError("");
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
      setAiRunError(userMessage(cause));
    }
  };
  const cancelAi = async () => {
    if (!aiRun) return;
    try {
      await ai.cancelJob(aiRun.id);
      setAiRun({ ...aiRun, status: "CANCELLED" });
      setAiTick((value) => value + 1);
    } catch (cause) {
      setAiRunError(userMessage(cause));
    }
  };
  const retryAi = async () => {
    if (!aiRun) return;
    setAiRunError("");
    try {
      const again = await ai.retryJob(aiRun.id);
      setAiRun({ ...again, input: again.input ?? aiRun.input });
      setAiTick((value) => value + 1);
    } catch (cause) {
      setAiRunError(userMessage(cause));
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
      name: `${selectedResult?.name ?? selected.name} · 임계값 ${threshold.toFixed(2)}`,
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
  const podLabel: Record<string, string> = {
    READY: "내 시각화 서버 연결됨",
    STARTING: "시각화 서버를 준비하고 있습니다",
    ERROR: "내 시각화 서버 오류",
  };
  const connectionLabel =
    xcubeConnected === null
      ? "확인 중"
      : xcubeConnected
        ? "연결됨"
        : "연결 안 됨";
  // ABSENT: everything of this user is already merged into the main xcube, so show the main server.
  const showPod = !!podState && podState !== "ABSENT";
  const statusText = showPod ? podLabel[podState!] ?? podState! : `XCube Server ${connectionLabel}`;
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
  const userName = user?.name ?? "사용자";
  const currentProject = projects.find((item) => item.id === projectId);
  const splitActive = compareActive && displayMode === "split";
  // Entry with datasets shows the map and one plain hint; the tour explains the rest.
  const emptyMessage = loading
    ? "데이터를 불러오는 중입니다…"
    : apiError ||
      (datasets.length || noDataHidden
        ? ""
        : "등록된 Zarr가 없습니다. 데이터를 추가해 시작하세요.");
  const pickHint = !selected && !loading && !apiError && datasets.length > 0 && !pickHintHidden;
  return (
    <main className="viewer vx" aria-label="XCube 시계열 GIS Viewer">
      <header className="vx-top">
        <a className="vx-brand" href="/" aria-label="XCube 소개 홈">
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
        <nav className="vx-crumbs" aria-label="보고 있는 프로젝트와 데이터">
          <span className="vx-crumbs__project" data-tour="project">
            {/* Quick project actions stay in the Viewer; long tasks open the app pages in a new tab. */}
            <ProjectQuickMenu
              project={currentProject}
              dataset={selected}
              inProject={projectDatasets.some((item) => item.id === selected?.id)}
              onCreated={(created) => {
                setProjects((items) => [created, ...items]);
                setProjectId(created.id);
                setFlash(`“${created.name}” 프로젝트를 만들었습니다.`);
              }}
              onLinked={(dataset, project) => {
                setProjectDatasets((items) =>
                  items.some((item) => item.id === dataset.id)
                    ? items
                    : [...items, dataset],
                );
                setFlash(`“${dataset.name}”을 “${project.name}”에 추가했습니다.`);
              }}
            />
            <label className={`vx-crumb ${projectId ? "" : "is-none"}`}>
              <span className="vx-sr">프로젝트</span>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                aria-label="프로젝트 선택"
              >
                <option value="">프로젝트 없음</option>
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
                ? { name: projectName ?? "프로젝트", items: pickableProject }
                : undefined
            }
            onUnavailable={(item) =>
              // Datasets reached only through a shared project are not in
              // the catalog list until the server grants project access.
              setNotice(
                `“${item.name}”은 공유받은 프로젝트를 통해서만 연결된 데이터라 아직 열 수 없습니다. 서버 권한 규칙이 반영되면 표시됩니다.`,
              )
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
              {{ online: "연결됨", offline: "연결 안 됨", starting: "준비 중", unknown: "확인 중" }[statusTone]}
            </span>
          </span>
          <a
            className="vx-btn vx-btn--quiet"
            data-tour="add"
            href="/app/data/new"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Zarr 업로드 또는 생성"
            title="데이터 추가 (새 탭)"
          >
            <Plus size={16} aria-hidden="true" />
            <span className="vx-hide-md">데이터 추가</span>
          </a>
          {selected && selected.kind !== "AI_RESULT" && (
            <button
              type="button"
              className="vx-btn vx-btn--line"
              aria-label="AI 수체 추출"
              title="AI 수체 추출"
              data-tour="ai"
              aria-pressed={drawer === "ai"}
              onClick={() => openRightPanel("ai")}
            >
              <Waves size={16} aria-hidden="true" />
              <span className="vx-hide-sm">AI 수체 추출</span>
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
              <span>결과</span>
            </button>
          )}
          <button
            type="button"
            className="vx-icon-btn"
            onClick={() => setTourOpen(true)}
            aria-label="기능 둘러보기"
            title="기능 둘러보기"
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
        className={`vx-body ${panelOpen ? "panel-open" : ""} ${drawer && !rightCollapsed ? "drawer-open" : ""} ${drawer && rightCollapsed ? "rail-open" : ""}`}
      >
        <section
          ref={mapBoxRef}
          className={`vx-map ${splitActive ? "is-split" : ""} ${compareActive ? "is-comparing" : ""}`}
          aria-label="시계열 위성 데이터 지도"
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
              aria-label="레이어 및 AI 작업 패널 열기"
              title="레이어 / AI 작업"
            >
              <Layers size={16} aria-hidden="true" />
              <span>레이어</span>
            </button>
          )}
          <div
            className="vx-tools"
            role="toolbar"
            aria-label="지도 도구"
            aria-orientation="vertical"
            data-tour="tools"
          >
            <div className="vx-tools__group">
              <button
                type="button"
                aria-label="이동"
                title="이동"
                aria-pressed={mapTool === "pan"}
                onClick={() => selectMapTool("pan")}
              >
                <Hand size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="픽셀 값 조회"
                title="픽셀 값 조회 (키보드: 방향키로 이동, Enter로 조회)"
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
                aria-label="확대"
                title="확대"
                onClick={() => zoomMap(1)}
              >
                <ZoomIn size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="축소"
                title="축소"
                onClick={() => zoomMap(-1)}
              >
                <ZoomOut size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="데이터 영역 맞춤"
                title="데이터 영역 맞춤"
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
                  aria-label="픽셀 선택 지우기"
                  title="픽셀 선택 지우기"
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
              aria-label="키보드 픽셀 조회"
              aria-describedby="vx-probe-hint"
              onKeyDown={moveProbe}
              onClick={queryProbe}
            >
              <span id="vx-probe-hint" className="vx-sr">
                방향키로 십자선을 옮기고 Enter로 그 지점의 시계열을 조회합니다. Shift를
                함께 누르면 크게 움직이고, Esc를 누르면 이동 도구로 돌아갑니다.
              </span>
            </button>
          )}
          {pixelTip && (
            <div className="vx-toast" role="status">
              지도를 클릭하면 그 지점의 시계열이 아래에 열립니다. 키보드는 방향키와 Enter.
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
                  데이터 추가
                </a>
              )}
            </div>
          )}
          {pickHint && !tourOpen && (
            <div className="vx-empty vx-empty--pick">
              <p>
                <strong>지도에 띄울 위성 데이터를 고르세요.</strong>
                고르면 촬영 시점별 영상과 아래 타임라인이 나타납니다.
              </p>
              <button
                type="button"
                className="vx-btn vx-btn--ink"
                onClick={() => setPickerRequest((value) => value + 1)}
              >
                데이터 고르기
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
          {selected && selectedResult && (resultVisible || aiCompare) && !(aiCompare && displayMode === "swipe") && (
            <AiLegend
              entry={selectedResult}
              timeLabel={times[timeIndex]?.label}
              covered={!!resultTime}
            />
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
          {selected && !compareActive && (
            <div className="vx-mapinfo" aria-hidden="true">
              {activeVariable && (
                <span className="vx-mapinfo__var">
                  {activeVariable === "rgb" ? "RGB 합성" : activeVariable}
                </span>
              )}
              {variableStyle?.colorBarMin != null && variableStyle?.colorBarMax != null && (
                <span className="tabular">
                  {variableStyle.colorBarMin} – {variableStyle.colorBarMax}
                  {variableStyle.units && variableStyle.units !== "1" ? ` ${variableStyle.units}` : ""}
                </span>
              )}
              <span>좌표계 EPSG:4326</span>
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
                    <span>원본 <span className="tabular">{times[timeIndex]?.label ?? "—"}</span></span>
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
            aria-label="레이어 및 AI 작업 패널"
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
                  레이어
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "jobs"}
                  onClick={() => setTab("jobs")}
                >
                  AI 작업
                  {entries.length > 0 && (
                    <span className="vx-count tabular">{entries.length}</span>
                  )}
                </button>
              </div>
              <button
                type="button"
                className="vx-icon-btn"
                onClick={() => setPanelOpen(false)}
                aria-label="패널 닫기"
                title="패널 접기"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            {tab === "layers" ? (
              <div className="vx-panel__body">
                {selected && (
                  <section className="vx-section">
                    <h2 className="vx-section__title">표시할 밴드</h2>
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
                        RGB는 눈으로 보는 색입니다. 픽셀 시계열은 개별 밴드에서 조회합니다.
                      </p>
                    )}
                  </section>
                )}
                <section className="vx-section">
                  <h2 className="vx-section__title">레이어</h2>
                  <div className="vx-layers">
                    {hasInference && (
                      <LayerControl
                        label="AI 수체 결과"
                        accent="result"
                        checked={resultVisible}
                        onChecked={setResultVisible}
                        opacity={resultOpacity}
                        onOpacity={setResultOpacity}
                      />
                    )}
                    {selected && (
                      <LayerControl
                        label="원본 Zarr"
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
                        <span>OpenLayers 배경지도</span>
                      </label>
                    </div>
                  </div>
                </section>
                {selected && (
                  <section className="vx-section">
                    <h3 className="vx-section__title">데이터 정보</h3>
                    <dl className="vx-meta">
                      <div>
                        <dt>이름</dt>
                        <dd title={selected.name}>{selected.name}</dd>
                      </div>
                      <div>
                        <dt>시점</dt>
                        <dd className="tabular">{times.length}개</dd>
                      </div>
                      {times.length > 0 && (
                        <div>
                          <dt>기간</dt>
                          <dd className="tabular">
                            {times[0]?.label} ~ {times[times.length - 1]?.label}
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt>밴드</dt>
                        <dd className="tabular">{selected.variables.length}개</dd>
                      </div>
                      <div>
                        <dt>좌표계</dt>
                        <dd>EPSG:4326</dd>
                      </div>
                    </dl>
                  </section>
                )}
              </div>
            ) : (
              <div className="vx-panel__body">
                <section className="vx-section">
                  <h2 className="vx-section__title">이 데이터의 AI 결과</h2>
                  {jobsError && (
                    <p className="vx-section__hint" role="status">
                      연결된 결과 목록: {jobsError}
                    </p>
                  )}
                  {selected ? (
                    <AiResultList entries={entries} selectedKey={resultKey} onSelect={chooseResult} />
                  ) : (
                    <p className="vx-section__hint">데이터를 고르면 그 데이터의 AI 결과가 보입니다.</p>
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
              aria-label={`${drawer === "ai" ? "AI 작업" : "결과"} 열기`}
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
            aria-label={drawer === "ai" ? "AI 수체 추출 설정" : "결과 비교"}
          >
            <div className="vx-drawer__head">
              <div>
                <h2>{drawer === "ai" ? "AI 수체 추출" : "원본 대비 결과"}</h2>
                <p title={drawer === "ai" ? selected?.name : selectedResult?.name}>
                  {drawer === "ai"
                    ? isRunning(aiRunHere)
                      ? "수체 추출 실행 중"
                      : selected?.name ?? "새 분석 작업"
                    : selectedResult?.name ?? "원본과 결과 레이어"}
                </p>
              </div>
              <span>
                <button
                  type="button"
                  className="vx-icon-btn"
                  onClick={() => setRightCollapsed(true)}
                  aria-label="분석 패널 접기"
                  title="분석 패널 접기"
                >
                  <ChevronsRight size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="vx-icon-btn"
                  onClick={closeRightPanel}
                  aria-label="패널 닫기"
                  title="닫기"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </span>
            </div>
            <div className="vx-tabs vx-tabs--full" role="tablist" aria-label="분석 패널 탭">
              <button
                type="button"
                role="tab"
                aria-selected={drawer === "ai"}
                onClick={() => openRightPanel("ai")}
              >
                AI 작업
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
                  결과
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
                    onRun={startAi}
                    onCancel={cancelAi}
                    onRetry={retryAi}
                  />
                  <section className="vx-section vx-section--top">
                    <h3 className="vx-section__title">이 데이터의 AI 결과</h3>
                    <AiResultList entries={entries} selectedKey={resultKey} onSelect={chooseResult} />
                  </section>
                </>
              ) : drawer === "result" && selected && selectedResult ? (
                <>
                  {readyEntries.length > 1 && (
                    <label className="vx-field vx-form__pad">
                      <span>결과 고르기</span>
                      <select aria-label="비교할 AI 결과" value={resultKey} onChange={(event) => setResultKey(event.target.value)}>
                        {readyEntries.map((entry) => (
                          <option key={entry.key} value={entry.key}>{entry.name}</option>
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
                <p className="vx-section__hint vx-form__pad">아직 고를 수 있는 AI 결과가 없습니다.</p>
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
            aria-label="시계열 탐색기"
            data-tour="timeline"
          >
            <div className="vx-timeline__lead">
              <div className="vx-player">
                <button
                  type="button"
                  className="vx-icon-btn"
                  onClick={() => setTimeIndex(Math.max(0, timeIndex - 1))}
                  aria-label="이전 시점"
                  title="이전 시점 (←)"
                >
                  <ChevronLeft size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="vx-play"
                  onClick={() => setPlaying(!playing)}
                  aria-label={playing ? "일시정지" : "재생"}
                  aria-pressed={playing}
                  title={playing ? "일시정지 (Space)" : "재생 (Space)"}
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
                  aria-label="다음 시점"
                  title="다음 시점 (→)"
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
                  {times[timeIndex]?.label ?? "시점 없음"}
                </strong>
                {aiCompare ? (
                  <span className="vx-btime vx-btime--ai">
                    <i className="vx-hatch" aria-hidden="true" />
                    원본 ↔ AI 결과
                  </span>
                ) : compareActive ? (
                  <CompareTime
                    times={times}
                    compareIndex={compareIndex}
                    onCompareIndex={setCompareIndex}
                  />
                ) : null}
                <small className="tabular vx-current__count">
                  {times.length ? `${timeIndex + 1} / ${times.length}` : "시점 없음"}
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
