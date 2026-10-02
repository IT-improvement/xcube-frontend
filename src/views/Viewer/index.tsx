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
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  ChevronUp,
  CircleAlert,
  CircleHelp,
  Crosshair,
  Database,
  FolderKanban,
  Hand,
  Layers,
  Layers2,
  LoaderCircle,
  LogOut,
  Moon,
  PanelLeftClose,
  MousePointerClick,
  Pause,
  Play,
  Plus,
  Repeat,
  Satellite,
  Scan,
  Search,
  SkipBack,
  SkipForward,
  Sparkles,
  Sun,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import "./style.css";
import "./v2.css";
import "./viewer.css";
import ViewerTour, { tourDismissed } from "./ViewerTour";
import ProjectQuickMenu from "./ProjectQuickMenu";

type Drawer = "ai" | "result" | null;
type Period = "현재 시점" | "선택 기간" | "전체 기간";
type MapTool = "pan" | "pixel";
const noop = () => undefined;

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
  const [period, setPeriod] = useState<Period>("현재 시점");
  const [threshold, setThreshold] = useState(65);
  const [jobState, setJobState] = useState<"idle" | "running" | "completed">(
    "idle",
  );
  const [jobs, setJobs] = useState<AiJob[]>([]);
  const [localInference, setLocalInference] = useState<Record<string, boolean>>(
    {},
  );
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
  const hasLinkedInference = jobs.some(
    (job) =>
      job.inputDatacubeId === selected?.id &&
      job.status === "SUCCEEDED" &&
      !!job.outputDatacubeId &&
      (job.outputType === "AI_RESULT" || job.outputType === "INFER_ZARR"),
  );
  const hasInference =
    !!selected && (hasLinkedInference || localInference[selected.id]);
  const times = useMemo(() => selected?.times ?? [], [selected]);
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
  }, [datasetId, jobState]);
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
  }, [datasetId]);
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
        if (!points.length) {
          setViewerNotice("시계열 응답에 표시할 값이 없습니다.");
          return;
        }
        setSeriesPoints(points);
        setPixel(coordinate);
      } catch (cause) {
        setViewerNotice(userMessage(cause));
      }
    },
    [mapTool, selected, sourceVisible, resultVisible, times, activeVariable],
  );
  const selectMapTool = (tool: MapTool) => {
    setMapTool(tool);
    setPixelTip(tool === "pixel");
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
  const runAi = async () => {
    if (!selected || !useMockApi) return;
    setJobState("running");
    const job = await activeViewerAdapter.runWaterExtraction(
      selected.id,
      period,
    );
    setJobs((current) => [job, ...current]);
    setLocalInference((current) => ({ ...current, [selected.id]: true }));
    setResultVisible(true);
    setJobState("completed");
  };
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
  const statusClass = showPod
    ? podState === "READY"
      ? "is-online"
      : podState === "ERROR"
        ? "is-offline"
        : podState === "STARTING"
          ? "is-starting"
          : ""
    : xcubeConnected === false
      ? "is-offline"
      : xcubeConnected
        ? "is-online"
        : "";
  // Entry with datasets shows the bare map; the tour explains the screen instead.
  const emptyMessage = loading
    ? "데이터를 불러오는 중입니다…"
    : apiError ||
      (datasets.length || noDataHidden
        ? ""
        : "등록된 Zarr가 없습니다. 데이터를 추가해 시작하세요.");
  return (
    <main className="viewer vx" aria-label="XCube 시계열 GIS Viewer">
      <header className="vx-top">
        <a className="vx-brand" href="/" aria-label="XCube 소개 홈">
          <svg viewBox="0 0 28 28" aria-hidden="true">
            <rect width="28" height="28" rx="7" fill="currentColor" />
            <path
              d="M14 6.5 21 10.5v7L14 21.5 7 17.5v-7L14 6.5Z"
              fill="none"
              stroke="#fff"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M7 10.5 14 14.5l7-4M14 14.5v7"
              fill="none"
              stroke="#fff"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
          <span className="vx-brand__name">XCube</span>
          <span className="vx-brand__product">Viewer</span>
        </a>
        <div className="vx-pickers">
          <label className="vx-select" data-tour="project">
            <span className="vx-select__label">프로젝트</span>
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
            <ChevronDown size={16} aria-hidden="true" />
          </label>
          <DatasetPicker
            datasets={datasets}
            value={datasetId}
            onChange={setDatasetId}
            tourId="dataset"
          />
        </div>
        <div className="vx-top__actions">
          <span
            className={`vx-status ${statusClass}`}
            title={statusText}
            role="status"
          >
            <i aria-hidden="true" />
            <span>{statusText}</span>
          </span>
          <span className="vx-divider" aria-hidden="true" />
          {/* Quick project actions stay in the Viewer; long tasks open the app pages in a new tab. */}
          <ProjectQuickMenu
            project={projects.find((item) => item.id === projectId)}
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
          <a
            className="vx-btn vx-btn--secondary"
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
          {selected && (
            <button
              type="button"
              className="vx-btn vx-btn--primary"
              aria-label="AI 수체 추출"
              title="AI 수체 추출"
              data-tour="ai"
              aria-pressed={drawer === "ai"}
              onClick={() => openRightPanel("ai")}
            >
              <Sparkles size={16} aria-hidden="true" />
              <span className="vx-hide-sm">AI 수체 추출</span>
            </button>
          )}
          {hasInference && (
            <button
              type="button"
              className="vx-btn vx-btn--water"
              aria-pressed={drawer === "result"}
              onClick={() => openRightPanel("result")}
            >
              <Layers2 size={16} aria-hidden="true" />
              <span>결과</span>
            </button>
          )}
          <span className="vx-divider" aria-hidden="true" />
          <button
            type="button"
            className="vx-icon-btn"
            onClick={() => setTourOpen(true)}
            aria-label="기능 둘러보기"
            title="기능 둘러보기"
          >
            <CircleHelp size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="vx-icon-btn"
            onClick={toggleTheme}
            aria-pressed={theme === "dark"}
            aria-label={
              theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"
            }
            title={theme === "dark" ? "라이트 모드" : "다크 모드"}
          >
            {theme === "dark" ? (
              <Sun size={18} aria-hidden="true" />
            ) : (
              <Moon size={18} aria-hidden="true" />
            )}
          </button>
          <div className="vx-user">
            <span className="vx-user__avatar" aria-hidden="true">
              {(user?.name ?? "사용자").slice(0, 1)}
            </span>
            <span className="vx-user__name vx-hide-md">
              {user?.name ?? "사용자"}
            </span>
            <button
              type="button"
              className="vx-icon-btn"
              onClick={onLogout}
              aria-label={`${user?.name ?? "사용자"} 로그아웃`}
              title="로그아웃"
            >
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>
      {projectId && (
        <section
          className="vx-project"
          aria-label="현재 프로젝트의 Zarr 데이터큐브"
        >
          <div className="vx-project__title">
            <FolderKanban size={16} aria-hidden="true" />
            <strong>{`${projectName ?? "프로젝트"}의 데이터큐브`}</strong>
            <span>프로젝트 내부 목록</span>
          </div>
          <div className="vx-project__list">
            {projectDatasets.map((item) => (
              <button
                type="button"
                key={item.id}
                className={item.id === datasetId ? "active" : ""}
                aria-pressed={item.id === datasetId}
                onClick={() => {
                  // Datasets reached only through a shared project are not in
                  // the catalog list until the server grants project access.
                  if (!datasets.some((known) => known.id === item.id)) {
                    setNotice(
                      `“${item.name}”은 공유받은 프로젝트를 통해서만 연결된 데이터라 아직 열 수 없습니다. 서버 권한 규칙이 반영되면 표시됩니다.`,
                    );
                    return;
                  }
                  setDatasetId(item.id);
                }}
              >
                <Database size={14} aria-hidden="true" />
                {item.name}
                <small>{item.subtitle}</small>
              </button>
            ))}
            {!projectDatasets.length && (
              <span className="vx-project__empty">
                이 프로젝트에 등록된 Zarr가 없습니다.
              </span>
            )}
          </div>
        </section>
      )}

      <div
        className={`vx-body ${panelOpen ? "panel-open" : ""} ${drawer ? "drawer-open" : ""}`}
      >
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
                  {jobs.length > 0 && (
                    <span className="vx-count">{jobs.length}</span>
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
                <PanelLeftClose size={18} aria-hidden="true" />
              </button>
            </div>
            {tab === "layers" ? (
              <div className="vx-panel__body">
                <section className="vx-section">
                  <h2 className="vx-section__title">표시 레이어</h2>
                  <p className="vx-section__hint">
                    체크하면 지도에서 표시됩니다.
                  </p>
                  <div className="vx-layers">
                    {hasInference && (
                      <LayerControl
                        label="AI 결과 Zarr"
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
                    <label className="vx-layer vx-layer--base">
                      <input
                        type="checkbox"
                        checked={baseVisible}
                        onChange={(e) => setBaseVisible(e.target.checked)}
                      />
                      <i className="vx-swatch vx-swatch--base" />
                      <span>OpenLayers 배경지도</span>
                    </label>
                  </div>
                </section>
                {selected && (
                  <section className="vx-section">
                    <h3 className="vx-section__title">활성 변수 / Band</h3>
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
                  </section>
                )}
                {selected && (
                  <section className="vx-section">
                    <h3 className="vx-section__title">데이터 정보</h3>
                    <dl className="vx-meta">
                      <div>
                        <dt>이름</dt>
                        <dd title={selected.name}>{selected.name}</dd>
                      </div>
                      <div>
                        <dt>시점 수</dt>
                        <dd className="tabular">{times.length}</dd>
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
                        <dt>변수 수</dt>
                        <dd className="tabular">{selected.variables.length}</dd>
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
                  <h2 className="vx-section__title">최근 AI 작업</h2>
                  {jobsError ? (
                    <p className="vx-section__hint" role="status">
                      AI 작업 목록: {jobsError}
                    </p>
                  ) : jobs.length ? (
                    <div className="vx-jobs">
                      {jobs.map((job) => (
                        <button
                          type="button"
                          className="vx-job"
                          key={job.id}
                          onClick={() =>
                            job.status === "SUCCEEDED" && job.outputDatacubeId
                              ? setDrawer("result")
                              : undefined
                          }
                        >
                          <i
                            className={`vx-job__dot is-${job.status.toLowerCase()}`}
                            aria-hidden="true"
                          />
                          <span>
                            수체 추출 #{job.id}
                            <small>
                              {job.status} · {job.period}
                            </small>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="vx-section__hint">
                      선택한 Zarr의 작업이 없습니다.
                    </p>
                  )}
                </section>
              </div>
            )}
          </aside>
        )}

        <section className="vx-map" aria-label="시계열 위성 데이터 지도">
          <div
            className="vx-tools"
            role="toolbar"
            aria-label="지도 도구"
            data-tour="tools"
          >
            {!panelOpen && (
              <>
                <button
                  type="button"
                  onClick={() => setPanelOpen(true)}
                  data-tour="layers"
                  aria-label="레이어 및 AI 작업 패널 열기"
                  title="레이어 / AI 작업"
                >
                  <Layers size={18} aria-hidden="true" />
                </button>
                <span className="vx-tools__sep" aria-hidden="true" />
              </>
            )}
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
              title="픽셀 값 조회"
              aria-pressed={mapTool === "pixel"}
              disabled={!selected}
              onClick={() => selectMapTool("pixel")}
            >
              <Crosshair size={18} aria-hidden="true" />
            </button>
            <span className="vx-tools__sep" aria-hidden="true" />
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
            {pixel && (
              <>
                <span className="vx-tools__sep" aria-hidden="true" />
                <button
                  type="button"
                  aria-label="픽셀 선택 지우기"
                  title="픽셀 선택 지우기"
                  onClick={clearPixel}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
          <OlMap
            onMapReady={onMapReady}
            onPixelSelect={onPixelSelect}
            baseVisible={baseVisible}
            interactionMode={mapTool}
          />
          {pixelTip && (
            <div className="vx-toast" role="status">
              <MousePointerClick size={16} aria-hidden="true" />
              지도를 클릭해 시계열을 조회하세요
            </div>
          )}
          {!selected && emptyMessage && (
            <div
              className={`vx-empty ${apiError ? "is-error" : ""}`}
              aria-live="polite"
            >
              <span className="vx-empty__icon" aria-hidden="true">
                {loading ? (
                  <LoaderCircle size={22} className="vx-spin" />
                ) : apiError ? (
                  <CircleAlert size={22} />
                ) : (
                  <Satellite size={22} />
                )}
              </span>
              <p>{emptyMessage}</p>
              {!loading && !apiError && (
                <div className="vx-empty__actions">
                  <a
                    className="vx-btn vx-btn--secondary"
                    href="/app/data/new"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Plus size={16} aria-hidden="true" />
                    데이터 추가
                  </a>
                </div>
              )}
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
              {flash}
            </div>
          )}
          {selected && viewerNotice && (
            <div className="vx-toast vx-toast--notice" role="status">
              <CircleAlert size={16} aria-hidden="true" />
              {viewerNotice}
            </div>
          )}
          {selected && resultVisible && hasInference && (
            <div
              className="result-overlay"
              style={{ opacity: resultOpacity / 100 }}
              aria-label="AI 수체 추출 결과 레이어"
            />
          )}
          {selected && (
            <div className="vx-mapinfo" aria-hidden="true">
              <span>좌표계 EPSG:4326</span>
              {activeVariable && <span>{activeVariable.toUpperCase()}</span>}
            </div>
          )}
          {pixel && <PixelMarker map={map} coordinate={pixel} />}
        </section>

        {drawer && rightCollapsed && (
          <aside className="vx-drawer-rail">
            <button
              type="button"
              onClick={() => setRightCollapsed(false)}
              aria-label={`${drawer === "ai" ? "AI 작업" : "결과"} 열기`}
            >
              {drawer === "ai" ? (
                <Sparkles size={18} aria-hidden="true" />
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
                <h2>{drawer === "ai" ? "AI 수체 추출" : "결과 비교"}</h2>
                <p title={selected?.name}>
                  {drawer === "ai"
                    ? jobState === "running"
                      ? "분석 작업 실행 중"
                      : "새 분석 작업"
                    : "원본과 결과 레이어"}
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
                {jobState === "running" && (
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
              {drawer === "ai" ? (
                <div className="vx-form">
                  <label className="vx-field">
                    <span>모델</span>
                    <select>
                      <option>WaterNet v2.1</option>
                      <option>NDWI 기반</option>
                    </select>
                  </label>
                  <fieldset className="vx-field">
                    <legend>시간 범위</legend>
                    <div className="vx-radios">
                      {(["현재 시점", "선택 기간", "전체 기간"] as Period[]).map(
                        (value) => (
                          <label className="vx-radio" key={value}>
                            <input
                              type="radio"
                              name="period"
                              checked={period === value}
                              onChange={() => setPeriod(value)}
                            />
                            {value}
                          </label>
                        ),
                      )}
                    </div>
                  </fieldset>
                  <label className="vx-field">
                    <span className="vx-field__row">
                      판단 임계값
                      <small className="tabular">
                        {(threshold / 100).toFixed(2)}
                      </small>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                    />
                  </label>
                  <label className="vx-field">
                    <span>처리 영역</span>
                    <select>
                      <option>현재 지도 영역</option>
                      <option>전체 데이터 영역</option>
                      <option>선택한 영역</option>
                    </select>
                  </label>
                  {jobState !== "idle" && (
                    <div className="vx-note vx-note--info" aria-live="polite">
                      {jobState === "running"
                        ? "수체 추출 작업을 처리하고 있습니다…"
                        : "수체 추출이 완료되었습니다."}
                    </div>
                  )}
                  {!useMockApi && (
                    <div className="vx-note">
                      AI 실행 API는 아직 준비되지 않았습니다. 기존 완료 결과만
                      조회할 수 있습니다.
                    </div>
                  )}
                  <button
                    type="button"
                    className="vx-btn vx-btn--primary vx-btn--block"
                    disabled={!useMockApi || jobState === "running"}
                    onClick={runAi}
                  >
                    {!useMockApi
                      ? "AI 실행 준비 중"
                      : jobState === "running"
                        ? "처리 중…"
                        : jobState === "completed"
                          ? "다시 실행"
                          : "수체 추출 시작"}
                  </button>
                </div>
              ) : (
                <div className="vx-form">
                  <div className="vx-layers">
                    <LayerControl
                      label="원본 Zarr"
                      accent="source"
                      checked={sourceVisible}
                      onChecked={setSourceVisible}
                      opacity={sourceOpacity}
                      onOpacity={setSourceOpacity}
                    />
                    <LayerControl
                      label="수체 추출 결과"
                      accent="result"
                      checked={resultVisible}
                      onChecked={setResultVisible}
                      opacity={resultOpacity}
                      onOpacity={setResultOpacity}
                    />
                  </div>
                  <div className="vx-note vx-note--info">
                    두 레이어를 중첩 비교할 수 있습니다.
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {pixel && selected && (
        <BottomGraphPanel
          expanded={graphExpanded}
          onToggle={() => setGraphExpanded((value) => !value)}
          dataset={selected}
          variable={activeVariable}
          points={seriesPoints}
          coordinate={pixelLonLat}
          currentTime={times[timeIndex]?.iso}
        />
      )}

      {selected && (
        <section
          className="vx-timeline"
          aria-label="시계열 탐색기"
          data-tour="timeline"
        >
          <div className="vx-player">
            <button
              type="button"
              className="vx-icon-btn"
              onClick={() => setTimeIndex(0)}
              aria-label="첫 시점"
              title="첫 시점"
            >
              <SkipBack size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="vx-icon-btn"
              onClick={() => setTimeIndex(Math.max(0, timeIndex - 1))}
              aria-label="이전 시점"
              title="이전 시점"
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="vx-play"
              onClick={() => setPlaying(!playing)}
              aria-label={playing ? "일시정지" : "재생"}
              aria-pressed={playing}
              title={playing ? "일시정지" : "재생"}
            >
              {playing ? (
                <Pause size={18} aria-hidden="true" />
              ) : (
                <Play size={18} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className="vx-icon-btn"
              onClick={() =>
                setTimeIndex(Math.min(times.length - 1, timeIndex + 1))
              }
              aria-label="다음 시점"
              title="다음 시점"
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="vx-icon-btn"
              onClick={() => setTimeIndex(times.length - 1)}
              aria-label="마지막 시점"
              title="마지막 시점"
            >
              <SkipForward size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="vx-current">
            <strong className="tabular">{times[timeIndex]?.label ?? "—"}</strong>
            <small className="tabular">
              {times.length ? `${timeIndex + 1} / ${times.length}` : "시점 없음"}
            </small>
          </div>
          <div className="vx-track">
            <input
              className="vx-range"
              type="range"
              min="0"
              max={Math.max(0, times.length - 1)}
              value={timeIndex}
              style={
                {
                  "--progress": `${times.length > 1 ? (timeIndex / (times.length - 1)) * 100 : 0}%`,
                } as React.CSSProperties
              }
              onChange={(e) => {
                setTimeIndex(Number(e.target.value));
                setPlaying(false);
              }}
              aria-label="관측 시점"
            />
            {times.length > 1 && times.length <= 60 && (
              <div className="vx-ticks" aria-hidden="true">
                {times.map((time, index) => (
                  <i
                    key={time.iso}
                    className={index <= timeIndex ? "on" : ""}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="vx-speed" role="group" aria-label="재생 속도">
            {[0.5, 1, 2, 4].map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={speed === value}
                onClick={() => setSpeed(value)}
              >
                {value}x
              </button>
            ))}
          </div>
          <label className={`vx-loop ${loop ? "on" : ""}`} title="반복 재생">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
            />
            <Repeat size={16} aria-hidden="true" />
            <span className="vx-hide-sm">반복</span>
          </label>
        </section>
      )}
      {tourOpen && <ViewerTour onClose={() => setTourOpen(false)} />}
    </main>
  );
}

function PixelMarker({
  map,
  coordinate,
}: {
  map: Map | null;
  coordinate: [number, number];
}) {
  const [position, setPosition] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (!map || typeof map.getPixelFromCoordinate !== "function") return;
    const update = () => {
      const pixel = map.getPixelFromCoordinate(coordinate);
      setPosition(pixel ? [pixel[0], pixel[1]] : null);
    };
    update();
    map.on("postrender", update);
    map.on("moveend", update);
    return () => {
      map.un("postrender", update);
      map.un("moveend", update);
    };
  }, [map, coordinate]);
  if (!position) return null;
  return (
    <div
      className="pixel-marker"
      style={{ left: position[0], top: position[1] }}
      aria-label="선택한 픽셀 위치"
    />
  );
}

function BottomGraphPanel({
  expanded,
  onToggle,
  dataset,
  variable,
  points,
  coordinate,
  currentTime,
}: {
  expanded: boolean;
  onToggle: () => void;
  dataset: ZarrDataset;
  variable: string;
  points: SeriesPoint[];
  coordinate: { lon: number; lat: number } | null;
  currentTime?: string;
}) {
  const units = dataset.variableMetadata?.[variable]?.units;
  const label = expanded
    ? "픽셀 그래프 아래로 숨기기"
    : "픽셀 그래프 위로 펼치기";
  return (
    <section
      className={`vx-graph ${expanded ? "expanded" : "hidden"}`}
      aria-label="픽셀 시계열 그래프 패널"
      aria-live="polite"
    >
      <div className="vx-graph__head">
        <span className="vx-graph__title">
          <Crosshair size={14} aria-hidden="true" />
          <strong>픽셀 시계열</strong>
          {coordinate && (
            <small className="tabular">
              {coordinate.lon.toFixed(5)}, {coordinate.lat.toFixed(5)}
            </small>
          )}
          {variable && <b>{variable}</b>}
        </span>
        <button
          type="button"
          className="vx-icon-btn"
          onClick={onToggle}
          aria-label={label}
          title={label}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown size={18} aria-hidden="true" />
          ) : (
            <ChevronUp size={18} aria-hidden="true" />
          )}
        </button>
      </div>
      {expanded && (
        <section className="vx-graph__chart">
          <TimeseriesChart
            dataset={dataset.name}
            variable={variable}
            units={units}
            points={points}
            coordinate={coordinate}
            currentTime={currentTime}
          />
        </section>
      )}
    </section>
  );
}

function TimeseriesChart({
  dataset,
  variable,
  units,
  points,
  coordinate,
  currentTime,
}: {
  dataset: string;
  variable: string;
  units?: string;
  points: SeriesPoint[];
  coordinate: { lon: number; lat: number } | null;
  currentTime?: string;
}) {
  // Draw in the container's own pixel size so the chart fills the panel without
  // stretching text; 900x260 is the fallback where ResizeObserver is unavailable.
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 260 });
  useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      if (w > 0 && h > 0)
        setSize({ width: Math.max(320, Math.round(w)), height: Math.max(140, Math.round(h)) });
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  const { width, height } = size;
  const left = 56;
  const right = 16;
  const top = 12;
  const bottom = 36;
  const valid = points.filter(
    (point) => typeof point.value === "number" && Number.isFinite(point.value),
  );
  const rawMin = valid.length
    ? Math.min(...valid.map((point) => point.value as number))
    : 0;
  const rawMax = valid.length
    ? Math.max(...valid.map((point) => point.value as number))
    : 1;
  const padding =
    rawMin === rawMax
      ? Math.max(Math.abs(rawMin) * 0.05, 1)
      : (rawMax - rawMin) * 0.05;
  const min = rawMin - padding;
  const max = rawMax + padding;
  const x = (index: number) =>
    left + (index * (width - left - right)) / Math.max(points.length - 1, 1);
  const y = (value: number) =>
    top + ((max - value) * (height - top - bottom)) / (max - min);
  const segments: string[] = [];
  let segment = "";
  points.forEach((point, index) => {
    if (point.value == null || !Number.isFinite(point.value)) {
      if (segment) segments.push(segment);
      segment = "";
      return;
    }
    segment += `${segment ? " L" : "M"}${x(index)} ${y(point.value)}`;
  });
  if (segment) segments.push(segment);
  const exactIndex = currentTime
    ? points.findIndex((point) => point.time === currentTime)
    : -1;
  const target = currentTime ? new Date(currentTime).getTime() : NaN;
  let currentIndex = exactIndex >= 0 ? exactIndex : 0;
  if (exactIndex < 0 && Number.isFinite(target))
    points.forEach((point, index) => {
      const candidate = new Date(point.time).getTime();
      const currentCandidate = new Date(points[currentIndex]?.time).getTime();
      if (
        Number.isFinite(candidate) &&
        (!Number.isFinite(currentCandidate) ||
          Math.abs(candidate - target) < Math.abs(currentCandidate - target))
      )
        currentIndex = index;
    });
  const tickIndexes = Array.from(
    new Set(
      [0, 0.25, 0.5, 0.75, 1].map((ratio) =>
        Math.round(Math.max(0, points.length - 1) * ratio),
      ),
    ),
  );
  const unit = units ?? "";
  const dateLabel = (time: string) => {
    const date = new Date(time);
    return Number.isNaN(date.getTime())
      ? time
      : `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const current = points[currentIndex];
  const coordinateLabel = coordinate
    ? `EPSG:4326 · 경도 ${coordinate.lon.toFixed(5)}° · 위도 ${coordinate.lat.toFixed(5)}°`
    : "EPSG:4326";
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(
    (ratio) => min + (max - min) * ratio,
  );
  return (
    <div className="professional-chart" ref={boxRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${dataset} ${variable} 시계열 그래프, ${coordinateLabel}, 최소 ${rawMin}, 최대 ${rawMax}, 유효 ${valid.length}개`}
      >
        <title>
          {dataset} · {variable} · {coordinateLabel}
        </title>
        <desc>
          전체 {points.length}시점 중 유효 {valid.length}시점.{unit && ` 단위 ${unit}.`}
        </desc>
        {yTicks.map((value) => (
          <g key={value}>
            <line
              className="grid"
              x1={left}
              y1={y(value)}
              x2={width - right}
              y2={y(value)}
            />
            <text
              className="axis-label"
              x={left - 5}
              y={y(value) + 3}
              textAnchor="end"
            >
              {value.toFixed(Math.abs(value) < 10 ? 2 : 1)}
            </text>
          </g>
        ))}
        {min < 0 && max > 0 && (
          <line
            className="zero-line"
            x1={left}
            y1={y(0)}
            x2={width - right}
            y2={y(0)}
          />
        )}
        {segments.map((path, index) => (
          <path key={index} className="line" d={path} />
        ))}
        {points.map((point, index) =>
          point.value == null || !Number.isFinite(point.value) ? (
            <circle
              key={index}
              className="missing-point"
              cx={x(index)}
              cy={(top + height - bottom) / 2}
              r="3"
            >
              <title>{point.time}: 값 없음</title>
            </circle>
          ) : (
            <circle
              key={index}
              className="data-point"
              cx={x(index)}
              cy={y(point.value)}
              r="2"
            >
              <title>
                {point.time} · {variable}: {point.value} {unit} ·{" "}
                {coordinateLabel}
              </title>
            </circle>
          ),
        )}
        {tickIndexes.map(
          (index) =>
            points[index] && (
              <text
                key={index}
                className="axis-label"
                x={x(index)}
                y={height - 5}
                textAnchor={
                  index === 0
                    ? "start"
                    : index === points.length - 1
                      ? "end"
                      : "middle"
                }
              >
                {dateLabel(points[index].time)}
              </text>
            ),
        )}
        {current && (
          <g className="current-time">
            <line
              className="cursor"
              x1={x(currentIndex)}
              y1={top}
              x2={x(currentIndex)}
              y2={height - bottom}
            />
            {current.value != null && Number.isFinite(current.value) && (
              <circle
                className="current-point"
                cx={x(currentIndex)}
                cy={y(current.value)}
                r="6"
              >
                <title>
                  {current.time}: {current.value} {unit}
                </title>
              </circle>
            )}
          </g>
        )}
      </svg>
      {!valid.length && (
        <div className="chart-empty">
          선택한 위치에 유효한 픽셀값이 없습니다.
        </div>
      )}
    </div>
  );
}

function DatasetPicker({
  datasets,
  value,
  onChange,
  tourId,
}: {
  datasets: ZarrDataset[];
  value: string;
  onChange: (value: string) => void;
  tourId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = datasets.find((item) => item.id === value);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return datasets
      .filter(
        (item) =>
          !needle ||
          [item.name, item.xcubeDatasetId, item.projectName].some((text) =>
            text?.toLowerCase().includes(needle),
          ),
      )
      .sort(
        (a, b) =>
          (a.accessType === "SHARED" ? 1 : 0) -
          (b.accessType === "SHARED" ? 1 : 0),
      );
  }, [datasets, query]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => {
    itemRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) =>
        Math.max(
          0,
          Math.min(
            filtered.length - 1,
            current + (event.key === "ArrowDown" ? 1 : -1),
          ),
        ),
      );
    } else if (event.key === "Enter" && filtered[active]) {
      event.preventDefault();
      choose(filtered[active].id);
    }
  };
  return (
    <div
      className="dataset-picker"
      ref={rootRef}
      onKeyDown={onKeyDown}
      data-tour={tourId}
    >
      <span className="picker-label">데이터</span>
      <button
        type="button"
        className="dataset-trigger"
        role="combobox"
        aria-label="데이터 또는 Zarr 선택"
        aria-expanded={open}
        aria-controls="zarr-listbox"
        onClick={() => setOpen((value) => !value)}
      >
        <Database size={16} aria-hidden="true" className="dataset-trigger__icon" />
        <span>{selected?.name ?? "데이터셋 선택"}</span>
        {selected && (
          <small className={selected.accessType === "SHARED" ? "shared" : ""}>
            {selected.accessType === "SHARED" ? "공유" : "소유"}
          </small>
        )}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="dataset-popover">
          <div className="dataset-search">
            <Search size={16} aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              placeholder="Zarr 검색"
              aria-label="Zarr 검색"
            />
          </div>
          <div
            id="zarr-listbox"
            className="dataset-list"
            role="listbox"
            aria-label="Zarr 목록"
          >
            {filtered.length ? (
              filtered.map((item, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={item.id === value}
                  key={item.id}
                  ref={(node) => {
                    itemRefs.current[index] = node;
                  }}
                  className={index === active ? "active-option" : ""}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(item.id)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.accessType === "SHARED" ? "공유" : "소유"} ·{" "}
                      {item.projectName || "프로젝트 없음"}
                    </small>
                  </span>
                  {item.id === value && (
                    <Check size={16} aria-hidden="true" />
                  )}
                </button>
              ))
            ) : (
              <p className="dataset-empty">검색 결과가 없습니다.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LayerControl({
  label,
  accent,
  checked,
  onChecked,
  opacity,
  onOpacity,
}: {
  label: string;
  accent: string;
  checked: boolean;
  onChecked: (value: boolean) => void;
  opacity: number;
  onOpacity: (value: number) => void;
}) {
  return (
    <div className={`vx-layer-card ${checked ? "" : "is-off"}`}>
      <label className="vx-layer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChecked(e.target.checked)}
        />
        <i className={`vx-swatch vx-swatch--${accent}`} />
        <span>{label}</span>
      </label>
      <label className="vx-opacity">
        <span>투명도</span>
        <span className="tabular">{opacity}%</span>
        <input
          type="range"
          min="0"
          max="100"
          value={opacity}
          onChange={(e) => onOpacity(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
