import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map from "ol/Map";
import TileLayer from "ol/layer/Tile";
import OlMap from "../../components/map";
import addDynamicXcubeLayer from "../../components/xcubeLayer";
import { AiJob, Project, ZarrDataset } from "../../api/viewerAdapter";
import { activeViewerAdapter, useMockApi } from "../../api";
import {
  backofficeAdapter,
  ProjectMember,
  SeriesPoint,
} from "../../api/backofficeApi";
import { userMessage } from "../../api/httpClient";
import { User } from "../../api/authApi";
import {
  ColorBarOption,
  GeeCollection,
  SpatialInspection,
  generationApi,
} from "../../api/generationApi";
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

type Drawer = "ai" | "result" | null;
type Period = "현재 시점" | "선택 기간" | "전체 기간";
type MapTool = "pan" | "pixel";
const noop = () => undefined;

export default function Viewer({
  user,
  onLogout = noop,
}: {
  user?: User;
  onLogout?: () => void;
}) {
  const { theme, toggle: toggleTheme } = useTheme();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [datasets, setDatasets] = useState<ZarrDataset[]>([]);
  const [projectDatasets, setProjectDatasets] = useState<ZarrDataset[]>([]);
  const [datasetId, setDatasetId] = useState("");
  // The layer panel starts open on wide screens (S7) and collapsed on narrow ones.
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 1280);
  const [pickerRequest, setPickerRequest] = useState(0);
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
  const [dialog, setDialog] = useState<"project" | null>(null);
  const [zarrStudioOpen, setZarrStudioOpen] = useState(false);
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
  const selected = datasets.find((item) => item.id === datasetId) ?? null;
  const selectedId = selected?.id;
  const selectedXcubeDatasetId = selected?.xcubeDatasetId;
  const selectedBbox = selected?.bbox;
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
      tileUrl: backofficeAdapter.tileUrl(
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
  useEffect(() => {
    if (
      !map ||
      typeof map.getView !== "function" ||
      typeof map.updateSize !== "function"
    )
      return;
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
  const connectionLabel =
    xcubeConnected === null
      ? "확인 중"
      : xcubeConnected
        ? "연결됨"
        : "연결 안 됨";
  const emptyMessage = loading
    ? "데이터를 불러오는 중입니다…"
    : apiError ||
      (datasets.length
        ? "데이터셋을 선택하면 레이어와 시계열 도구가 열립니다."
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
          <label className="vx-select">
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
            openRequest={pickerRequest}
          />
        </div>
        <div className="vx-top__actions">
          <span
            className={`vx-status ${xcubeConnected === false ? "is-offline" : xcubeConnected ? "is-online" : ""}`}
            title={`시각화 서버 ${connectionLabel}`}
          >
            <i aria-hidden="true" />
            <span>XCube Server {connectionLabel}</span>
          </span>
          <span className="vx-divider" aria-hidden="true" />
          <button
            type="button"
            className="vx-icon-btn"
            onClick={() => setDialog("project")}
            aria-label="프로젝트 관리"
            title="프로젝트 관리"
          >
            <FolderKanban size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="vx-btn vx-btn--secondary"
            onClick={() => {
              setDrawer(null);
              setRightCollapsed(false);
              setZarrStudioOpen(true);
            }}
            aria-label="Zarr 업로드 또는 생성"
            title="Zarr 업로드 또는 생성"
          >
            <Plus size={16} aria-hidden="true" />
            <span className="vx-hide-md">데이터 추가</span>
          </button>
          {selected && (
            <button
              type="button"
              className="vx-btn vx-btn--primary"
              aria-label="AI 수체 추출"
              title="AI 수체 추출"
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
                onClick={() => setDatasetId(item.id)}
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
          <aside className="vx-panel" aria-label="레이어 및 AI 작업 패널">
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
          <div className="vx-tools" role="toolbar" aria-label="지도 도구">
            {!panelOpen && (
              <>
                <button
                  type="button"
                  onClick={() => setPanelOpen(true)}
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
                  {datasets.length > 0 && (
                    <button
                      type="button"
                      className="vx-btn vx-btn--primary"
                      onClick={() => setPickerRequest((value) => value + 1)}
                    >
                      <Database size={16} aria-hidden="true" />
                      데이터 선택
                    </button>
                  )}
                  <button
                    type="button"
                    className="vx-btn vx-btn--secondary"
                    onClick={() => setZarrStudioOpen(true)}
                  >
                    <Plus size={16} aria-hidden="true" />
                    데이터 추가
                  </button>
                </div>
              )}
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
        <section className="vx-timeline" aria-label="시계열 탐색기">
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
      {dialog === "project" && (
        <ProjectManager
          projects={projects}
          datasets={datasets}
          selectedId={projectId}
          onSelect={setProjectId}
          onProjects={setProjects}
          onDatasets={setDatasets}
          onProjectDatasets={setProjectDatasets}
          onClose={() => setDialog(null)}
        />
      )}
      {zarrStudioOpen && (
        <ZarrStudio
          onClose={() => setZarrStudioOpen(false)}
          onSaved={(resource) => {
            if (useMockApi) {
              setDatasets((current) => [resource, ...current]);
              setDatasetId(resource.id);
            } else {
              setViewerNotice(
                "Zarr가 등록되었습니다. XCube 동기화가 완료되면 목록에 표시됩니다.",
              );
              activeViewerAdapter.getDatasets().then(setDatasets).catch(fail);
            }
          }}
          onError={fail}
        />
      )}
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
  const top = 24;
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
  const unit = units || "단위 미제공";
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
          전체 {points.length}시점 중 유효 {valid.length}시점. 단위 {unit}.
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
        <text className="axis-title" x={4} y={16}>
          픽셀값 ({unit})
        </text>
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
  openRequest = 0,
}: {
  datasets: ZarrDataset[];
  value: string;
  onChange: (value: string) => void;
  openRequest?: number;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (openRequest > 0) setOpen(true);
  }, [openRequest]);
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
    <div className="dataset-picker" ref={rootRef} onKeyDown={onKeyDown}>
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

function ProjectManager({
  projects,
  datasets,
  selectedId,
  onSelect,
  onProjects,
  onDatasets,
  onProjectDatasets,
  onClose,
}: {
  projects: Project[];
  datasets: ZarrDataset[];
  selectedId: string;
  onSelect: (id: string) => void;
  onProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  onDatasets: React.Dispatch<React.SetStateAction<ZarrDataset[]>>;
  onProjectDatasets: React.Dispatch<React.SetStateAction<ZarrDataset[]>>;
  onClose: () => void;
}) {
  const [currentId, setCurrentId] = useState(
    selectedId || projects[0]?.id || "",
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "owned" | "shared">("all");
  const [mode, setMode] = useState<"view" | "edit" | "create">("view");
  const [tab, setTab] = useState<"overview" | "access" | "zarr">("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [projectCubes, setProjectCubes] = useState<ZarrDataset[]>([]);
  const [linkableCubes, setLinkableCubes] = useState<ZarrDataset[]>(datasets);
  const [linkPicker, setLinkPicker] = useState(false);
  const [zarrQuery, setZarrQuery] = useState("");
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberError, setMemberError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const current = projects.find((project) => project.id === currentId);
  const role = current?.accessRole;
  const owner = role === "OWNER";
  const canEdit = role === "OWNER" || role === "EDITOR";
  const roleLabel =
    role === "OWNER" ? "소유자" : role === "EDITOR" ? "편집자" : "보기 전용";
  const filtered = projects.filter(
    (project) =>
      (filter === "all" ||
        (filter === "owned"
          ? project.accessRole === "OWNER"
          : project.accessRole !== "OWNER")) &&
      [project.name, project.description].some((value) =>
        value?.toLowerCase().includes(query.toLowerCase()),
      ),
  );
  useEffect(() => {
    if (tab !== "zarr" || !currentId || !activeViewerAdapter.getProjectDatasets)
      return;
    activeViewerAdapter
      .getProjectDatasets(currentId)
      .then(setProjectCubes)
      .catch((cause) => setError(userMessage(cause)));
    if (!useMockApi)
      backofficeAdapter
        .getLinkableDatacubes()
        .then(setLinkableCubes)
        .catch((cause) => setError(userMessage(cause)));
  }, [tab, currentId]);
  useEffect(() => {
    if (tab !== "access" || !currentId || !owner) return;
    if (useMockApi) {
      setMembers([]);
      setMemberError("데모 모드에서는 공유 관리를 사용할 수 없습니다.");
      return;
    }
    setMembersLoading(true);
    setMemberError("");
    backofficeAdapter
      .getProjectMembers(currentId)
      .then(setMembers)
      .catch((cause) => setMemberError(userMessage(cause)))
      .finally(() => setMembersLoading(false));
  }, [tab, currentId, owner]);
  const dirty = () =>
    mode !== "view" &&
    !!formRef.current &&
    new FormData(formRef.current).entries().next().done === false;
  const safeNavigate = (action: () => void) => {
    if (
      dirty() &&
      !window.confirm("저장하지 않은 변경사항이 있습니다. 계속할까요?")
    )
      return;
    action();
    setError("");
  };
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const input = {
      name: String(data.get("name")),
      description: String(data.get("description") ?? ""),
    };
    try {
      const saved =
        mode === "create"
          ? await backofficeAdapter.createProject(input)
          : await backofficeAdapter.updateProject(currentId, input);
      onProjects((items) =>
        mode === "create"
          ? [saved, ...items]
          : items.map((item) => (item.id === saved.id ? saved : item)),
      );
      setCurrentId(saved.id);
      onSelect(saved.id);
      setMode("view");
      setToast(
        mode === "create"
          ? "프로젝트를 만들었습니다."
          : "변경사항을 저장했습니다.",
      );
    } catch (cause) {
      setError(userMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      await backofficeAdapter.deleteProject(current.id);
      const remaining = projects.filter((project) => project.id !== current.id);
      onProjects(remaining);
      const next = remaining[0]?.id || "";
      setCurrentId(next);
      if (selectedId === current.id) onSelect(next);
      setConfirmDelete(false);
      setToast("프로젝트를 삭제했습니다.");
    } catch (cause) {
      setError(userMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const addMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!current || !owner) return;
    const data = new FormData(event.currentTarget);
    const userId = String(data.get("userId") ?? "").trim();
    const memberRole = String(data.get("role")) as "EDITOR" | "VIEWER";
    if (!/^\d+$/.test(userId)) {
      setMemberError("사용자 ID는 숫자로 입력해 주세요.");
      return;
    }
    setBusy(true);
    setMemberError("");
    try {
      const member = await backofficeAdapter.addProjectMember(current.id, {
        userId,
        role: memberRole,
      });
      setMembers((items) => [
        ...items.filter((item) => item.userId !== member.userId),
        member,
      ]);
      event.currentTarget.reset();
      setToast("프로젝트를 공유했습니다.");
    } catch (cause) {
      setMemberError(userMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const updateMember = async (
    member: ProjectMember,
    memberRole: "EDITOR" | "VIEWER",
  ) => {
    if (!current || !owner) return;
    setMemberError("");
    try {
      const saved = await backofficeAdapter.updateProjectMember(
        current.id,
        member.userId,
        { role: memberRole },
      );
      setMembers((items) =>
        items.map((item) => (item.userId === saved.userId ? saved : item)),
      );
      setToast("공유 권한을 변경했습니다.");
    } catch (cause) {
      setMemberError(userMessage(cause));
    }
  };
  const removeMember = async (member: ProjectMember) => {
    if (
      !current ||
      !owner ||
      !window.confirm(
        `사용자 ${member.userId}의 프로젝트 접근 권한을 제거할까요?`,
      )
    )
      return;
    setMemberError("");
    try {
      await backofficeAdapter.removeProjectMember(current.id, member.userId);
      setMembers((items) =>
        items.filter((item) => item.userId !== member.userId),
      );
      setToast("프로젝트 접근 권한을 제거했습니다.");
    } catch (cause) {
      setMemberError(userMessage(cause));
    }
  };
  const linkDataset = async (cube: ZarrDataset) => {
    if (!current || !canEdit) return;
    setBusy(true);
    setError("");
    try {
      await backofficeAdapter.linkProjectDataset(current.id, cube.id);
      setProjectCubes((items) =>
        items.some((item) => item.id === cube.id) ? items : [...items, cube],
      );
      if (current.id === selectedId) {
        onProjectDatasets((items) =>
          items.some((item) => item.id === cube.id) ? items : [...items, cube],
        );
      }
      setToast("Zarr를 프로젝트에 연결했습니다.");
    } catch (cause) {
      setError(userMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const unlinkDataset = async (cube: ZarrDataset) => {
    if (
      !current ||
      !canEdit ||
      !window.confirm(
        "프로젝트에서만 연결이 해제됩니다. Zarr 원본은 삭제되지 않습니다.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await backofficeAdapter.unlinkProjectDataset(current.id, cube.id);
      setProjectCubes((items) => items.filter((item) => item.id !== cube.id));
      if (current.id === selectedId) {
        onProjectDatasets((items) =>
          items.filter((item) => item.id !== cube.id),
        );
      }
      setToast("Zarr 연결을 해제했습니다.");
    } catch (cause) {
      setError(userMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const deleteDataset = async (cube: ZarrDataset) => {
    if (cube.accessType === "SHARED") return;
    if (!window.confirm(`Zarr 원본 “${cube.name}”을 삭제할까요?\n모든 프로젝트 연결과 공유 목록에서도 사라집니다.`)) return;
    setBusy(true);
    setError("");
    try {
      await backofficeAdapter.deleteDatacube(cube.id);
      setLinkableCubes((items) => items.filter((item) => item.id !== cube.id));
      setProjectCubes((items) => items.filter((item) => item.id !== cube.id));
      onDatasets((items) => items.filter((item) => item.id !== cube.id));
      onProjectDatasets((items) => items.filter((item) => item.id !== cube.id));
      setToast("Zarr 원본을 삭제했습니다.");
    } catch (cause) {
      setError(userMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="project-manager"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-manager-title"
      >
        <header>
          <div>
            <h2 id="project-manager-title">프로젝트</h2>
            <span>{projects.length}개</span>
          </div>
          <button
            className="primary compact"
            onClick={() => safeNavigate(() => setMode("create"))}
          >
            새 프로젝트
          </button>
          <button
            className="icon-button"
            onClick={() => safeNavigate(onClose)}
            aria-label="프로젝트 관리 닫기"
          >
            ×
          </button>
        </header>
        <div className="project-manager-content">
          <aside className="project-browser">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="프로젝트 검색"
              aria-label="프로젝트 검색"
            />
            <div className="project-filter">
              <button
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
              >
                전체
              </button>
              <button
                aria-pressed={filter === "owned"}
                onClick={() => setFilter("owned")}
              >
                내 프로젝트
              </button>
              <button
                aria-pressed={filter === "shared"}
                onClick={() => setFilter("shared")}
              >
                공유받음
              </button>
            </div>
            <div className="project-list" role="listbox">
              {filtered.map((project) => (
                <button
                  role="option"
                  aria-selected={project.id === currentId}
                  key={project.id}
                  onClick={() =>
                    safeNavigate(() => {
                      setCurrentId(project.id);
                      setMode("view");
                      setTab("overview");
                    })
                  }
                >
                  <span>
                    <strong>{project.name}</strong>
                    <small>{project.description || "설명 없음"}</small>
                  </span>
                  <em>
                    {project.accessRole === "OWNER"
                      ? "소유자"
                      : project.accessRole === "EDITOR"
                        ? "편집자"
                        : "보기 전용"}
                  </em>
                </button>
              ))}
              {!filtered.length && <p>프로젝트가 없습니다.</p>}
            </div>
          </aside>
          <section className="project-inspector">
            {mode === "create" ? (
              <ProjectForm
                mode="create"
                formRef={formRef}
                busy={busy}
                error={error}
                onSubmit={save}
                onCancel={() => setMode("view")}
              />
            ) : current ? (
              <>
                <div className="project-detail-head">
                  <div>
                    <h3>{current.name}</h3>
                    <span>{roleLabel}</span>
                  </div>
                  {canEdit && tab === "overview" && mode === "view" && (
                    <button onClick={() => setMode("edit")}>편집</button>
                  )}
                </div>
                <div className="project-tabs" role="tablist">
                  <button
                    role="tab"
                    aria-selected={tab === "overview"}
                    onClick={() => setTab("overview")}
                  >
                    개요
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === "access"}
                    onClick={() => setTab("access")}
                  >
                    접근 권한
                  </button>
                  <button
                    role="tab"
                    aria-selected={tab === "zarr"}
                    onClick={() => setTab("zarr")}
                  >
                    Zarr
                  </button>
                </div>
                {tab === "overview" ? (
                  mode === "edit" ? (
                    <ProjectForm
                      mode="edit"
                      project={current}
                      formRef={formRef}
                      busy={busy}
                      error={error}
                      onSubmit={save}
                      onCancel={() => setMode("view")}
                    />
                  ) : (
                    <div className="project-overview">
                      <dl>
                        <dt>설명</dt>
                        <dd>{current.description || "설명 없음"}</dd>
                        <dt>생성일</dt>
                        <dd>
                          {current.createdAt
                            ? new Date(current.createdAt).toLocaleString(
                                "ko-KR",
                              )
                            : "—"}
                        </dd>
                        <dt>수정일</dt>
                        <dd>
                          {current.updatedAt
                            ? new Date(current.updatedAt).toLocaleString(
                                "ko-KR",
                              )
                            : "—"}
                        </dd>
                        <dt>프로젝트 ID</dt>
                        <dd>{current.id}</dd>
                      </dl>
                      {owner && (
                        <button
                          className="danger-link"
                          onClick={() => setConfirmDelete(true)}
                        >
                          프로젝트 삭제
                        </button>
                      )}
                    </div>
                  )
                ) : tab === "access" ? (
                  <ProjectAccessPanel
                    owner={owner}
                    members={members}
                    loading={membersLoading}
                    error={memberError}
                    busy={busy}
                    onAdd={addMember}
                    onUpdate={updateMember}
                    onRemove={removeMember}
                  />
                ) : (
                  <ProjectZarrPanel
                    canEdit={canEdit}
                    linked={projectCubes}
                    available={linkableCubes}
                    open={linkPicker}
                    query={zarrQuery}
                    busy={busy}
                    error={error}
                    onToggle={() => setLinkPicker((value) => !value)}
                    onQuery={setZarrQuery}
                    onLink={linkDataset}
                    onUnlink={unlinkDataset}
                    onDelete={deleteDataset}
                    onOpen={() => {
                      onSelect(current.id);
                      onClose();
                    }}
                  />
                )}
              </>
            ) : (
              <div className="project-empty">프로젝트를 선택하세요.</div>
            )}
          </section>
        </div>
        {toast && (
          <div className="manager-toast" role="status">
            {toast}
          </div>
        )}
        {confirmDelete && current && (
          <div className="confirm-layer">
            <section
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-title"
            >
              <h3 id="delete-title">프로젝트를 삭제할까요?</h3>
              <p>
                프로젝트 “{current.name}”의 연결 정보가 삭제됩니다. 연결된 Zarr
                원본은 삭제되지 않습니다.
              </p>
              <strong>되돌릴 수 없습니다.</strong>
              <div>
                <button onClick={() => setConfirmDelete(false)}>취소</button>
                <button className="danger" disabled={busy} onClick={remove}>
                  {busy ? "삭제 중…" : "프로젝트 삭제"}
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

function ProjectZarrPanel({
  canEdit,
  linked,
  available,
  open,
  query,
  busy,
  error,
  onToggle,
  onQuery,
  onLink,
  onUnlink,
  onDelete,
  onOpen,
}: {
  canEdit: boolean;
  linked: ZarrDataset[];
  available: ZarrDataset[];
  open: boolean;
  query: string;
  busy: boolean;
  error: string;
  onToggle: () => void;
  onQuery: (value: string) => void;
  onLink: (cube: ZarrDataset) => void;
  onUnlink: (cube: ZarrDataset) => void;
  onDelete: (cube: ZarrDataset) => void;
  onOpen: (cube: ZarrDataset) => void;
}) {
  const candidates = available.filter((cube) =>
    cube.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <section className="project-zarr">
      <header>
        <div>
          <h3>프로젝트 Zarr</h3>
          <p>전역 Zarr 원본을 이동하지 않고 프로젝트에 연결합니다.</p>
        </div>
        {canEdit && (
          <button onClick={onToggle}>
            {open ? "연결 목록 닫기" : "Zarr 연결"}
          </button>
        )}
      </header>
      {open && canEdit && (
        <div className="zarr-link-picker">
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Zarr 검색"
            aria-label="연결할 Zarr 검색"
          />
          {candidates.map((cube) => {
            const isLinked = linked.some((item) => item.id === cube.id);
            return (
              <button
                key={cube.id}
                disabled={isLinked || busy}
                onClick={() => onLink(cube)}
              >
                <span>
                  <strong>{cube.name}</strong>
                  <small>
                    {cube.accessType === "SHARED" ? "공유받은 Zarr" : "내 Zarr"}{" "}
                    · {cube.subtitle}
                  </small>
                </span>
                <em>{isLinked ? "연결됨" : "연결"}</em>
              </button>
            );
          })}
          {!candidates.length && <p>연결 가능한 Zarr가 없습니다.</p>}
        </div>
      )}
      <div className="project-zarr-list" aria-label="현재 연결된 Zarr">
        <h4>현재 연결</h4>
        {linked.map((cube) => (
          <div className="project-zarr-row" key={cube.id}>
            <button onClick={() => onOpen(cube)}>
              <strong>{cube.name}</strong>
              <small>{cube.subtitle}</small>
            </button>
            {canEdit && (
              <button
                className="member-remove"
                disabled={busy}
                onClick={() => onUnlink(cube)}
              >
                연결 해제
              </button>
            )}
          </div>
        ))}
        {!linked.length && <p>이 프로젝트에 연결된 Zarr가 없습니다.</p>}
      </div>
      <div className="project-zarr-list zarr-library" aria-label="내 Zarr 관리">
        <header>
          <div>
            <h4>내 Zarr 관리</h4>
            <p>원본 삭제는 모든 프로젝트 연결과 공유 목록에 영향을 줍니다.</p>
          </div>
        </header>
        {available.filter((cube) => cube.accessType !== "SHARED").map((cube) => (
          <div className="project-zarr-row" key={`manage-${cube.id}`}>
            <button aria-label="관리 항목 상세 열기" title={cube.name} onClick={() => onOpen(cube)}>
              <strong>{cube.name}</strong>
              <small>{cube.projectName || "프로젝트 없음"} · {cube.subtitle}</small>
            </button>
            <button className="member-remove danger-text" disabled={busy} onClick={() => onDelete(cube)}>
              원본 삭제
            </button>
          </div>
        ))}
        {!available.some((cube) => cube.accessType !== "SHARED") && <p>관리할 내 Zarr가 없습니다.</p>}
      </div>
      {error && (
        <div className="status" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

function ProjectAccessPanel({
  owner,
  members,
  loading,
  error,
  busy,
  onAdd,
  onUpdate,
  onRemove,
}: {
  owner: boolean;
  members: ProjectMember[];
  loading: boolean;
  error: string;
  busy: boolean;
  onAdd: (event: React.FormEvent<HTMLFormElement>) => void;
  onUpdate: (member: ProjectMember, role: "EDITOR" | "VIEWER") => void;
  onRemove: (member: ProjectMember) => void;
}) {
  if (!owner)
    return (
      <div className="project-empty">
        <h3>프로젝트 접근 권한</h3>
        <p>소유자만 공유 권한을 관리할 수 있습니다.</p>
      </div>
    );
  return (
    <section className="project-access" aria-labelledby="project-access-title">
      <header>
        <div>
          <h3 id="project-access-title">프로젝트 접근 권한</h3>
          <p>사용자 검색 API가 없어 숫자 사용자 ID로 공유합니다.</p>
        </div>
      </header>
      <form className="member-add" onSubmit={onAdd}>
        <label>
          사용자 ID
          <input
            name="userId"
            inputMode="numeric"
            pattern="[0-9]+"
            placeholder="숫자 사용자 ID"
            aria-describedby="member-id-help"
            required
          />
        </label>
        <small id="member-id-help">@ 없이 숫자 ID만 입력하세요.</small>
        <label>
          권한
          <select name="role" defaultValue="VIEWER">
            <option value="VIEWER">보기 전용</option>
            <option value="EDITOR">편집자</option>
          </select>
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "추가 중…" : "사용자 추가"}
        </button>
      </form>
      {error && (
        <div className="status" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <p className="member-state">권한 목록을 불러오는 중…</p>
      ) : (
        <div className="member-list" aria-label="프로젝트 멤버 목록">
          {members.map((member) => (
            <div className="member-row" key={member.userId}>
              <div>
                <strong>사용자 {member.userId}</strong>
                <small>
                  {member.createdAt
                    ? new Date(member.createdAt).toLocaleDateString("ko-KR")
                    : "추가일 정보 없음"}
                </small>
              </div>
              {member.role === "OWNER" ? (
                <span className="member-owner">소유자</span>
              ) : (
                <>
                  <select
                    aria-label={`사용자 ${member.userId} 권한`}
                    value={member.role}
                    onChange={(event) =>
                      onUpdate(
                        member,
                        event.target.value as "EDITOR" | "VIEWER",
                      )
                    }
                  >
                    <option value="VIEWER">보기 전용</option>
                    <option value="EDITOR">편집자</option>
                  </select>
                  <button
                    type="button"
                    className="member-remove"
                    onClick={() => onRemove(member)}
                    aria-label={`사용자 ${member.userId} 공유 해제`}
                  >
                    공유 해제
                  </button>
                </>
              )}
            </div>
          ))}
          {!members.length && !error && (
            <p className="member-state">공유된 사용자가 없습니다.</p>
          )}
        </div>
      )}
    </section>
  );
}

function ProjectForm({
  mode,
  project,
  formRef,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit";
  project?: Project;
  formRef: React.RefObject<HTMLFormElement | null>;
  busy: boolean;
  error: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState(project?.description ?? "");
  return (
    <form className="project-form" ref={formRef} onSubmit={onSubmit}>
      <h3>{mode === "create" ? "새 프로젝트" : "프로젝트 편집"}</h3>
      <label>
        이름
        <input
          name="name"
          required
          maxLength={150}
          defaultValue={project?.name}
        />
      </label>
      <label>
        설명
        <textarea
          name="description"
          maxLength={5000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <small>{description.length} / 5000</small>
      </label>
      {error && (
        <div className="status" role="alert">
          {error}
        </div>
      )}
      <footer>
        <button type="button" onClick={onCancel}>
          취소
        </button>
        <button className="primary" disabled={busy}>
          {busy
            ? mode === "create"
              ? "만드는 중…"
              : "저장 중…"
            : mode === "create"
              ? "프로젝트 만들기"
              : "변경사항 저장"}
        </button>
      </footer>
    </form>
  );
}

function ZarrStudio({
  onClose,
  onSaved,
  onError,
}: {
  onClose: () => void;
  onSaved: (resource: ZarrDataset) => void;
  onError: (error: unknown) => void;
}) {
  const [mode, setMode] = useState<"upload" | "generate">("upload");
  return (
    <aside
      className="zarr-studio"
      role="dialog"
      aria-modal="true"
      aria-labelledby="zarr-studio-title"
    >
      <header className="zarr-studio-head">
        <div>
          <span>ZARR WORKSPACE</span>
          <h2 id="zarr-studio-title">Zarr 추가</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Zarr 패널 닫기"
        >
          ×
        </button>
      </header>
      <div className="zarr-studio-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={mode === "upload"}
          onClick={() => setMode("upload")}
        >
          업로드
        </button>
        <button
          role="tab"
          aria-selected={mode === "generate"}
          onClick={() => setMode("generate")}
        >
          생성
        </button>
      </div>
      <div className="zarr-studio-body">
        {mode === "upload" ? (
          <ZarrUploadForm onSaved={onSaved} onError={onError} />
        ) : (
          <GenerationSourcePanel />
        )}
      </div>
    </aside>
  );
}

type GenerationSource = "geotiff" | "shape" | "gee";
function GenerationSourcePanel() {
  const [source, setSource] = useState<GenerationSource>("geotiff");
  const sources: Array<{
    id: GenerationSource;
    icon: string;
    title: string;
    description: string;
  }> = [
    {
      id: "geotiff",
      icon: "▧",
      title: "위성 영상",
      description: "위성별 전처리로 생성",
    },
    {
      id: "shape",
      icon: "⬡",
      title: "Shapefile",
      description: "벡터 영역·속성으로 생성",
    },
    {
      id: "gee",
      icon: "◉",
      title: "Google Earth Engine",
      description: "위성 자료를 검색해 생성",
    },
  ];
  return (
    <section className="generation-workflow">
      <div className="workflow-heading">
        <span>1</span>
        <div>
          <h3>원본 데이터 선택</h3>
          <p>Zarr로 변환할 데이터 종류를 선택하세요.</p>
        </div>
      </div>
      <div
        className="source-cards"
        role="radiogroup"
        aria-label="생성 데이터 종류"
      >
        {sources.map((item) => (
          <button
            type="button"
            key={item.id}
            className={source === item.id ? "selected" : ""}
            role="radio"
            aria-checked={source === item.id}
            onClick={() => setSource(item.id)}
          >
            <i>{item.icon}</i>
            <span>
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </span>
            <b aria-hidden="true">{source === item.id ? "✓" : ""}</b>
          </button>
        ))}
      </div>
      {source === "gee" ? (
        <GeeGenerationDialog embedded onClose={noop} />
      ) : source === "geotiff" ? (
        <GeoTiffBandForm />
      ) : (
        <LocalGenerationForm type="shape" />
      )}
    </section>
  );
}

function GeoTiffBandForm() {
  const [inspection, setInspection] = useState<SpatialInspection | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const inspect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setInspection(null);
    if (!file) return;
    setBusy(true);
    setMessage("CAS500 원본 구성을 확인하는 중…");
    try {
      const result = await generationApi.inspectSpatialFile("cas500", file);
      setInspection(result);
      setMessage(result.message);
    } catch (cause) {
      setMessage(userMessage(cause));
      event.target.value = "";
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="local-generation-form"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="workflow-heading compact">
        <span>2</span>
        <div>
          <h3>위성 종류와 원본 선택</h3>
          <p>위성마다 전처리 방식이 달라 전용 파이프라인으로 변환합니다.</p>
        </div>
      </div>
      <section className="form-card">
        <header>
          <h4>위성 종류</h4>
          <p>현재 CAS500 전처리를 우선 지원합니다.</p>
        </header>
        <label>
          위성
          <select value="cas500" disabled aria-label="위성 종류">
            <option value="cas500">CAS500</option>
          </select>
        </label>
      </section>
      <label className="file-drop">
        <input
          type="file"
          required
          accept=".zip,application/zip"
          onChange={inspect}
        />
        <span>
          <strong>
            {busy ? "CAS500 패키지 검사 중…" : "CAS500 원본 ZIP 선택"}
          </strong>
          <small>
            밴드 TIFF(_B, _G, _R, _N)와 해당 _Aux.xml을 함께 압축하세요.
          </small>
        </span>
      </label>
      {inspection && (
        <>
          <div className="inspection-summary">
            <strong>✓ CAS500 패키지 검사 완료</strong>
            <span>{inspection.fileName}</span>
            <small>
              {inspection.files.length}개 파일 · {inspection.bands.join(", ")}
            </small>
          </div>
          <section className="form-card">
            <header>
              <h4>자동 생성 밴드</h4>
              <p>
                파일명과 Aux.xml을 기준으로 지오코딩한 뒤 RGBN 시계열을
                만듭니다.
              </p>
            </header>
            <div className="band-selector">
              {inspection.bands.map((band) => (
                <span className="selected" key={band}>
                  {band}
                </span>
              ))}
            </div>
          </section>
        </>
      )}
      {message && (
        <div className="status" role="status">
          {message}
        </div>
      )}
      <button className="primary create-cta" disabled={!inspection || busy}>
        CAS500 Zarr 생성 요청
      </button>
    </form>
  );
}

function LocalGenerationForm({
  type,
}: {
  type: Exclude<GenerationSource, "gee">;
}) {
  const [colorBars, setColorBars] = useState<ColorBarOption[]>([]);
  const [message, setMessage] = useState("");
  const [inspection, setInspection] = useState<SpatialInspection | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [dataName, setDataName] = useState("");
  const [nameError, setNameError] = useState("");
  const nameEdited = useRef(false);
  useEffect(() => {
    generationApi
      .getColorBarOptions()
      .then(setColorBars)
      .catch((cause) => setMessage(userMessage(cause)));
  }, []);
  useEffect(() => {
    document
      .querySelectorAll<HTMLInputElement>(
        ".local-generation-form .coordinate-pair input, .local-generation-form .coordinate-pair + .studio-grid input",
      )
      .forEach((input) => {
        input.readOnly = true;
        input.setAttribute("aria-readonly", "true");
      });
  }, [inspection, type]);
  const inspectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setInspection(null);
    if (!file) return;
    setInspecting(true);
    setMessage("");
    try {
      const result = await generationApi.inspectSpatialFile(
        type === "geotiff" ? "geotiff" : "shapefile",
        file,
      );
      setInspection(result);
      if (type === "shape" && !nameEdited.current) {
        setDataName(result.fileName.replace(/\.zip$/i, ""));
      }
      setMessage(result.message);
    } catch (cause) {
      setMessage(userMessage(cause));
      event.target.value = "";
    } finally {
      setInspecting(false);
    }
  };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (type === "shape" && !dataName.trim()) {
      setNameError("데이터 이름을 입력하세요.");
      return;
    }
    setMessage(
      `${type === "geotiff" ? "GeoTIFF" : "Shapefile"} 변환 화면이 준비되었습니다. 실제 생성 요청은 파일 생성 API 연결 후 실행됩니다.`,
    );
  };
  return (
    <form
      className="local-generation-form"
 key={type}
      onSubmit={submit}
    >
      <div className="workflow-heading compact">
        <span>2</span>
        <div>
          <h3>파일 검사 및 생성 기준 설정</h3>
          <p>
            {type === "geotiff"
              ? "GeoTIFF를 올리면 GDAL이 밴드와 좌표를 자동으로 읽습니다."
              : "같은 이름의 .shp, .shx, .dbf, .prj가 포함된 ZIP 파일이 필요합니다."}
          </p>
        </div>
      </div>
      <label className="file-drop">
        <input
          type="file"
          required
          accept={
            type === "geotiff"
              ? ".tif,.tiff,image/tiff"
              : ".zip,application/zip"
          }
          onChange={inspectFile}
        />
        <span>
          <strong>
            {inspecting
              ? "GDAL로 검사 중…"
              : type === "geotiff"
                ? "GeoTIFF 파일 선택"
                : "Shapefile ZIP 선택"}
          </strong>
          <small>
            {type === "geotiff"
              ? ".tif · .tiff"
              : ".shp · .shx · .dbf · .prj 필수, 기타 부속파일 허용"}
          </small>
        </span>
      </label>
      {inspection && (
        <div className="inspection-summary">
          <strong>✓ 파일 검사 완료</strong>
          <span>{inspection.fileName}</span>
          <small>
            {inspection.files.length}개 구성파일 · {inspection.bands.length}개{" "}
            {type === "geotiff" ? "밴드" : "속성"}
          </small>
        </div>
      )}
      {type === "shape" ? (
        <section className={`spatial-name-field ${nameError ? "has-error" : ""} ${!inspection || inspecting ? "is-disabled" : ""}`} aria-labelledby="shape-name-label">
          <div className="spatial-name-head"><label id="shape-name-label" htmlFor="shape-data-name">출력 데이터 이름 <em>필수</em></label><output className="name-count" aria-live="polite">{dataName.length}/150</output></div>
          <div className="spatial-name-control"><span className="spatial-name-icon" aria-hidden="true"><svg viewBox="0 0 20 20" width="16" height="16"><path d="m10 2 7 4-7 4-7-4 7-4Zm-7 8 7 4 7-4M3 14l7 4 7-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg></span><textarea id="shape-data-name" name="name" rows={1} required maxLength={150} value={dataName} disabled={!inspection || inspecting} aria-invalid={!!nameError} aria-describedby={nameError ? "shape-name-help shape-name-error" : "shape-name-help"} placeholder="예: 울산 행정구역 2026" onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} onChange={(event) => { nameEdited.current = true; const value = event.target.value.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " "); setDataName(value); setNameError(value.trim() ? "" : "데이터 이름을 입력하세요."); }}/><span className="spatial-name-type" aria-hidden="true">ZARR</span></div>
          <div className="spatial-name-foot"><small id="shape-name-help">{inspection ? "지도와 데이터 목록에 표시되는 이름입니다." : "파일 검사를 완료하면 이름을 수정할 수 있습니다."}</small>{nameError && <small id="shape-name-error" role="alert">{nameError}</small>}</div>
        </section>
      ) : (
        <label>데이터 이름<input name="name" required defaultValue={inspection?.fileName.replace(/\.(tif|tiff)$/i, "") ?? ""} placeholder="예: 2026년 울산 위성영상"/></label>
      )}
      <section className="form-card">
        <header>
          <h4>GDAL 공간정보</h4>
          <p>
            좌하단 시작 좌표와 우상단 끝 좌표를 WGS84 위·경도로 자동 입력합니다.
          </p>
        </header>
        <div className="coordinate-pair">
          <fieldset>
            <legend>시작 좌표 · 좌하단</legend>
            <label>
              경도 (Longitude)
              <input
                type="number"
                step="any"
                name="west"
                defaultValue={inspection?.bounds?.west}
                placeholder="파일 검사 후 자동 입력"
                required
                readOnly={!!inspection}
              />
            </label>
            <label>
              위도 (Latitude)
              <input
                type="number"
                step="any"
                name="south"
                defaultValue={inspection?.bounds?.south}
                placeholder="파일 검사 후 자동 입력"
                required
                readOnly={!!inspection}
              />
            </label>
          </fieldset>
          <span aria-hidden="true">→</span>
          <fieldset>
            <legend>끝 좌표 · 우상단</legend>
            <label>
              경도 (Longitude)
              <input
                type="number"
                step="any"
                name="east"
                defaultValue={inspection?.bounds?.east}
                placeholder="파일 검사 후 자동 입력"
                required
                readOnly={!!inspection}
              />
            </label>
            <label>
              위도 (Latitude)
              <input
                type="number"
                step="any"
                name="north"
                defaultValue={inspection?.bounds?.north}
                placeholder="파일 검사 후 자동 입력"
                required
                readOnly={!!inspection}
              />
            </label>
          </fieldset>
        </div>
        {type === "geotiff" && (
          <div className="studio-grid">
            <label>
              가로 크기 (px)
              <input
                type="number"
                min="1"
                defaultValue={inspection?.width ?? ""}
                readOnly={!!inspection}
                required
              />
            </label>
            <label>
              세로 크기 (px)
              <input
                type="number"
                min="1"
                defaultValue={inspection?.height ?? ""}
                readOnly={!!inspection}
                required
              />
            </label>
          </div>
        )}
      </section>
      <section className="form-card">
        <header>
          <h4>표현 방식</h4>
          <p>
            GDAL에서 읽은 {type === "geotiff" ? "밴드" : "속성"}와 색상표를
            선택합니다.
          </p>
        </header>
        <label>
          {type === "geotiff" ? "밴드" : "속성"}
          <select name="variable" required disabled={!inspection}>
            {!inspection && <option value="">파일을 먼저 검사하세요</option>}
            {inspection?.bands.map((band) => (
              <option key={band}>{band}</option>
            ))}
          </select>
        </label>
        {type === "shape" && (
          <div className="studio-grid">
            <label>
              변환 방식
              <select name="shapeMode" defaultValue="categorical">
                <option value="categorical">범주형 값</option>
                <option value="normalized">수치형 0–1 정규화</option>
              </select>
            </label>
            <label>
              출력 해상도 (도)
              <input
                name="resolution"
                type="number"
                min="0.000001"
                step="0.000001"
                defaultValue="0.00025"
                required
              />
            </label>
          </div>
        )}
        <ColorBarSelect options={colorBars} />
        <div className="studio-grid">
          <label>
            표시 최솟값
            <input type="number" step="any" defaultValue="0" required />
          </label>
          <label>
            표시 최댓값
            <input type="number" step="any" defaultValue="1" required />
          </label>
        </div>
      </section>
      {message && (
        <div className="status" role="status">
          {message}
        </div>
      )}
      <button
        className="primary create-cta"
        disabled={!inspection || inspecting}
      >
        Zarr 생성 요청
      </button>
    </form>
  );
}

function ZarrUploadForm({
  onSaved,
  onError,
}: {
  onSaved: (resource: ZarrDataset) => void;
  onError: (error: unknown) => void;
}) {
  const [colorBars, setColorBars] = useState<ColorBarOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    generationApi
      .getColorBarOptions()
      .then(setColorBars)
      .catch((cause) => setMessage(userMessage(cause)));
  }, []);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const variable = String(data.get("variable"));
      const colorBar = String(data.get("colorBar"));
      const valueMin = Number(data.get("valueMin"));
      const valueMax = Number(data.get("valueMax"));
      if (
        !colorBars.some((item) => item.id === colorBar) ||
        valueMin >= valueMax
      )
        throw new Error("ColorBar와 표시 범위를 확인하세요.");
      const adapter = activeViewerAdapter as typeof backofficeAdapter;
      const result = await adapter.registerDatacube({
        name: String(data.get("name")),
        storageUri: String(data.get("storageUri")),
        metadata: {
          defaultVariable: variable,
          variables: [variable],
          bandStyles: [{ variable, colorBar, valueMin, valueMax }],
        },
      });
      onSaved(result);
      setMessage("Zarr 등록 요청이 완료되었습니다.");
    } catch (cause) {
      setMessage(userMessage(cause));
      onError(cause);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="zarr-studio-form" onSubmit={submit}>
      <div className="studio-intro">
        <strong>Zarr 업로드</strong>
        <p>
          현재는 서버 또는 오브젝트 스토리지의 Zarr 경로를 등록합니다. 파일
          전송은 Data Uploading 컨테이너 연결 단계에서 추가됩니다.
        </p>
      </div>
      <label>
        데이터 이름
        <input
          name="name"
          required
          maxLength={150}
          placeholder="예: 울산 수온 2026"
        />
      </label>
      <label>
        Zarr 경로 / URI
        <input
          name="storageUri"
          required
          placeholder="/data/sample.zarr 또는 s3://bucket/sample.zarr"
        />
      </label>
      <div className="studio-section">
        <h3>표시 Style</h3>
        <label>
          대표 밴드
          <input name="variable" required placeholder="예: ndvi" />
        </label>
        <ColorBarSelect options={colorBars} />
        <div className="studio-grid">
          <label>
            최솟값
            <input
              name="valueMin"
              type="number"
              step="any"
              defaultValue="0"
              required
            />
          </label>
          <label>
            최댓값
            <input
              name="valueMax"
              type="number"
              step="any"
              defaultValue="1"
              required
            />
          </label>
        </div>
      </div>
      {message && (
        <div className="status" role="status">
          {message}
        </div>
      )}
      <button className="primary" disabled={busy || !colorBars.length}>
        {busy ? "등록 중…" : "Zarr 등록"}
      </button>
    </form>
  );
}

function GeeGenerationDialog({
  onClose,
  embedded = false,
}: {
  onClose: () => void;
  embedded?: boolean;
}) {
  const [collections, setCollections] = useState<GeeCollection[]>([]);
  const [colorBars, setColorBars] = useState<ColorBarOption[]>([]);
  const [collectionId, setCollectionId] = useState("");
  const [selectedBands, setSelectedBands] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [rgb, setRgb] = useState(false);
  useEffect(() => {
    Promise.allSettled([
      generationApi.getCollections(),
      generationApi.getColorBarOptions(),
    ])
      .then(([collectionsResult, colorBarsResult]) => {
        const errors: string[] = [];
        if (collectionsResult.status === "fulfilled") {
          setCollections(collectionsResult.value);
          setCollectionId(collectionsResult.value[0]?.id ?? "");
        } else
          errors.push(`GEE 목록: ${userMessage(collectionsResult.reason)}`);
        if (colorBarsResult.status === "fulfilled")
          setColorBars(colorBarsResult.value);
        else errors.push(`ColorBar: ${userMessage(colorBarsResult.reason)}`);
        setMessage(errors.join(" · "));
      })
      .finally(() => setLoading(false));
  }, []);
  const collection = collections.find((item) => item.id === collectionId);
  const bandOptions = (collection?.bands ?? []).map((band) =>
    typeof band === "string"
      ? { value: band, label: band }
      : { value: band.id ?? band.name, label: band.name },
  );
  useEffect(() => {
    setSelectedBands([]);
  }, [collectionId]);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const bounds = {
        west: Number(data.get("west")),
        south: Number(data.get("south")),
        east: Number(data.get("east")),
        north: Number(data.get("north")),
      };
      const bandStyles = selectedBands.map((variable) => ({
        variable,
        colorBar: String(data.get(`color-${variable}`)),
        valueMin: Number(data.get(`min-${variable}`)),
        valueMax: Number(data.get(`max-${variable}`)),
      }));
      if (
        bandStyles.some(
          (style) =>
            !colorBars.some((item) => item.id === style.colorBar) ||
            style.valueMin >= style.valueMax,
        )
      )
        throw new Error("밴드 스타일 범위를 확인하세요.");
      const channel = (name: string) => ({
        variable: String(data.get(`rgb-${name}`)),
        valueMin: Number(data.get(`rgb-${name}-min`)),
        valueMax: Number(data.get(`rgb-${name}-max`)),
      });
      const rgbStyle = rgb
        ? {
            red: channel("red"),
            green: channel("green"),
            blue: channel("blue"),
          }
        : undefined;
      if (
        rgbStyle &&
        Object.values(rgbStyle).some(
          (item) =>
            !selectedBands.includes(item.variable) ||
            item.valueMin >= item.valueMax,
        )
      )
        throw new Error("RGB 세 채널과 범위를 모두 입력하세요.");
      const job = await generationApi.createGeeJob({
        name: String(data.get("name")),
        collectionId,
        bands: selectedBands,
        startDate: String(data.get("startDate")),
        endDate: String(data.get("endDate")),
        maxCloudPercent: Number(data.get("maxCloudPercent")),
        bounds,
        scaleMeters: Number(data.get("scaleMeters")),
        bandStyles,
        rgbStyle,
      });
      setMessage(`생성 작업 ${job.id} · ${job.status}`);
    } catch (cause) {
      setMessage(userMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const content = (
    <section
      className={`dialog gee-dialog ${embedded ? "embedded" : ""}`}
      role="dialog"
      aria-modal={!embedded}
      aria-labelledby="gee-title"
    >
      <header>
        <div>
          <span className="step-badge">2</span>
          <div>
            <h2 id="gee-title">GEE 검색 조건 설정</h2>
            <p>기간과 영역을 정한 뒤 필요한 밴드를 선택하세요.</p>
          </div>
        </div>
        {!embedded && (
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="대화상자 닫기"
          >
            ×
          </button>
        )}
      </header>
      {loading ? (
        <p className="panel-loading">GEE 컬렉션과 색상표를 불러오는 중…</p>
      ) : (
        <form onSubmit={submit}>
          <section className="form-card">
            <header>
              <h4>데이터</h4>
              <p>생성될 Zarr의 이름과 위성 자료를 선택합니다.</p>
            </header>
            <label>
              데이터 이름
              <input
                name="name"
                required
                maxLength={150}
                placeholder="예: 서울 Sentinel-2 2026-05"
              />
            </label>
            <label>
              위성 데이터
              <select
                value={collectionId}
                onChange={(event) => setCollectionId(event.target.value)}
                required
              >
                {collections.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title || item.name || item.id}
                  </option>
                ))}
              </select>
            </label>
          </section>
          <section className="form-card band-card">
            <header>
              <h4>
                밴드 선택 <small>{selectedBands.length}개 선택</small>
              </h4>
              <p>지도에서 확인하거나 분석할 파장대를 선택하세요.</p>
            </header>
            <fieldset className="band-selector">
              <legend className="sr-only">밴드</legend>
              {bandOptions.map((band) => (
                <label
                  key={band.value}
                  className={
                    selectedBands.includes(band.value) ? "selected" : ""
                  }
                >
                  <input
                    type="checkbox"
                    checked={selectedBands.includes(band.value)}
                    onChange={(event) =>
                      setSelectedBands((items) =>
                        event.target.checked
                          ? [...items, band.value]
                          : items.filter((item) => item !== band.value),
                      )
                    }
                  />
                  <span>
                    {band.label}
                    <small>{band.value}</small>
                  </span>
                  <b aria-hidden="true">✓</b>
                </label>
              ))}
            </fieldset>
          </section>
          <section className="form-card">
            <header>
              <h4>기간과 영상 품질</h4>
              <p>검색 기간, 허용 구름량, 출력 픽셀 크기를 설정합니다.</p>
            </header>
            <div className="gee-grid">
              <label>
                시작 날짜
                <input name="startDate" type="date" required />
              </label>
              <label>
                끝 날짜
                <input name="endDate" type="date" required />
              </label>
              <label>
                최대 구름량 (%)
                <input
                  name="maxCloudPercent"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue="20"
                  required
                />
              </label>
              <label>
                픽셀 크기 (m)
                <input
                  name="scaleMeters"
                  type="number"
                  min="10"
                  max="10000"
                  defaultValue="30"
                  required
                />
              </label>
            </div>
          </section>
          <section className="form-card bounds-card">
            <header>
              <h4>생성 영역</h4>
              <p>
                좌하단 시작 좌표에서 우상단 끝 좌표까지의 사각형 영역을
                생성합니다.
              </p>
            </header>
            <div className="coordinate-pair">
              <fieldset>
                <legend>시작 좌표 · 좌하단</legend>
                <label>
                  경도 (Longitude)
                  <input
                    name="west"
                    type="number"
                    step="any"
                    placeholder="예: 126.50"
                    required
                  />
                </label>
                <label>
                  위도 (Latitude)
                  <input
                    name="south"
                    type="number"
                    step="any"
                    placeholder="예: 35.00"
                    required
                  />
                </label>
              </fieldset>
              <span aria-hidden="true">→</span>
              <fieldset>
                <legend>끝 좌표 · 우상단</legend>
                <label>
                  경도 (Longitude)
                  <input
                    name="east"
                    type="number"
                    step="any"
                    placeholder="예: 129.50"
                    required
                  />
                </label>
                <label>
                  위도 (Latitude)
                  <input
                    name="north"
                    type="number"
                    step="any"
                    placeholder="예: 37.00"
                    required
                  />
                </label>
              </fieldset>
            </div>
          </section>
          <GeeStyleFields
            bands={selectedBands}
            colorBars={colorBars}
            rgb={rgb}
            onRgb={setRgb}
          />
          {message && (
            <div className="status" role="status">
              {message}
            </div>
          )}
          <div className="dialog-actions">
            {!embedded && (
              <button type="button" onClick={onClose}>
                취소
              </button>
            )}
            <button
              className="primary create-cta"
              disabled={
                busy ||
                !collectionId ||
                !selectedBands.length ||
                !colorBars.length
              }
            >
              {busy ? "요청 중…" : "Zarr 생성 요청"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
  return embedded ? (
    content
  ) : (
    <div className="dialog-backdrop" role="presentation">
      {content}
    </div>
  );
}

function ColorBarSelect({
  options,
  name = "colorBar",
}: {
  options: ColorBarOption[];
  name?: string;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    if (options.length && !options.some((item) => item.id === value))
      setValue(
        options.find((item) => item.id === "viridis")?.id ?? options[0].id,
      );
  }, [options, value]);
  const selected = options.find((item) => item.id === value);
  const categories = Array.from(
    new Set(options.map((item) => item.category || "기타")),
  );
  return (
    <label className="colorbar-control">
      <span>색상표</span>
      <div className="colorbar-preview">
        {selected?.preview ? (
          <img src={`data:image/png;base64,${selected.preview}`} alt="" />
        ) : (
          <i />
        )}
        <div>
          <strong>{selected?.id || "색상표 선택"}</strong>
          <small>{selected?.category || "데이터 값에 적용할 색상"}</small>
        </div>
      </div>
      <select
        name={name}
        required
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={!options.length}
        aria-label="색상표 선택"
      >
        <option value="" disabled>
          색상표 선택
        </option>
        {categories.map((category) => (
          <optgroup key={category} label={category}>
            {options
              .filter((item) => (item.category || "기타") === category)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function GeeStyleFields({
  bands,
  colorBars,
  rgb,
  onRgb,
}: {
  bands: string[];
  colorBars: ColorBarOption[];
  rgb: boolean;
  onRgb: (value: boolean) => void;
}) {
  return (
    <section className="gee-styles form-card">
      <header>
        <h4>지도 표현 방식</h4>
        <p>밴드별 색상표와 값의 표시 범위를 지정합니다.</p>
      </header>
      {!colorBars.length && (
        <div className="status">
          XCube 색상표를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </div>
      )}
      {bands.map((band) => (
        <div className="gee-style-row" key={band}>
          <strong>{band}</strong>
          <ColorBarSelect name={`color-${band}`} options={colorBars} />
          <label>
            표시 최솟값
            <input
              name={`min-${band}`}
              type="number"
              step="any"
              defaultValue="0"
              required
            />
          </label>
          <label>
            표시 최댓값
            <input
              name={`max-${band}`}
              type="number"
              step="any"
              defaultValue="1"
              required
            />
          </label>
        </div>
      ))}
      {bands.length >= 3 && (
        <>
          <label className="rgb-toggle">
            <input
              type="checkbox"
              checked={rgb}
              onChange={(event) => onRgb(event.target.checked)}
            />
            <span>
              <strong>RGB 컬러 영상 추가</strong>
              <small>빨강·초록·파랑 채널을 조합합니다.</small>
            </span>
          </label>
          {rgb && (
            <div className="rgb-grid">
              {(["red", "green", "blue"] as const).map((channel) => (
                <fieldset key={channel}>
                  <legend>{channel.toUpperCase()}</legend>
                  <select name={`rgb-${channel}`} required defaultValue="">
                    <option value="" disabled>
                      밴드 선택
                    </option>
                    {bands.map((band) => (
                      <option key={band}>{band}</option>
                    ))}
                  </select>
                  <input
                    aria-label={`${channel} 최솟값`}
                    name={`rgb-${channel}-min`}
                    type="number"
                    step="any"
                    defaultValue="0"
                    required
                  />
                  <input
                    aria-label={`${channel} 최댓값`}
                    name={`rgb-${channel}-max`}
                    type="number"
                    step="any"
                    defaultValue="1"
                    required
                  />
                </fieldset>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// Kept temporarily for the project-form migration path.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ResourceDialog({
  type,
  onClose,
  onSaved,
  onError,
}: {
  type: "project" | "zarr";
  onClose: () => void;
  onSaved: (resource: Project | ZarrDataset) => void;
  onError: (error: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const adapter = activeViewerAdapter as any;
      const result =
        type === "project"
          ? await adapter.createProject({
              name: String(data.get("name")),
              description: String(data.get("description") ?? ""),
            })
          : await adapter.registerDatacube({
              name: String(data.get("name")),
              storageUri: String(data.get("storageUri")) || undefined,
            });
      onSaved(result);
    } catch (cause) {
      setMessage(userMessage(cause));
      onError(cause);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resource-title"
      >
        <header>
          <h2 id="resource-title">
            {type === "project" ? "프로젝트 생성" : "Zarr 등록"}
          </h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="대화상자 닫기"
          >
            ×
          </button>
        </header>
        <form onSubmit={submit}>
          <label>
            이름
            <input name="name" required maxLength={150} />
          </label>
          {type === "project" ? (
            <label>
              설명
              <textarea name="description" maxLength={5000} />
            </label>
          ) : (
            <label>
              Storage URI
              <input
                name="storageUri"
                required
                placeholder="s3://bucket/data.zarr"
              />
            </label>
          )}
          {message && (
            <div className="status" role="alert">
              {message}
            </div>
          )}
          <div className="dialog-actions">
            <button type="button" onClick={onClose}>
              취소
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "저장 중…" : "저장"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
