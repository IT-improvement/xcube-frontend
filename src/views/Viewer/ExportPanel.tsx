// 내보내기 tab (UR-63 F2): the map PNG is made right here in the browser; GeoTIFF, animation (GIF/MP4) and the
// report PDF are export jobs on the server whose progress shows here (and in the job center) until the file can be
// downloaded.
import { useEffect, useRef, useState } from "react";
import { Download, FileImage, LoaderCircle, X } from "lucide-react";
import { EXPORT_LIMITS, exportFallbackName, exportsApi, isExportRunning, saveBlob } from "../../api/exports";
import type { ExportJob, ExportKind, ExportRequest } from "../../api/exports";
import { useMockApi } from "../../api";
import { userMessage } from "../../api/httpClient";
import { serverText } from "../../i18n/serverText";
import type { TimePoint } from "../../api/viewerAdapter";
import { useLanguage } from "../../i18n";
import "../../i18n/viewer";
import type { AreaShape } from "./areaDraw";
import { askOnceOnJobStart } from "../../app/browserNotify";

export type ExportTarget = { key: string; label: string; datasetId: string; variables: string[]; variable: string };
type TimeScope = "current" | "all" | "range";
type AreaScope = "data" | "view" | "shape";
type Entry = { job: ExportJob; kind: ExportKind; format?: string; failure?: unknown; downloading?: boolean };

const POLL_MS = useMockApi ? 700 : 2500;

export default function ExportPanel({
  targets,
  times,
  currentIndex,
  shape,
  viewBbox,
  datasetName,
  onPng,
}: {
  targets: ExportTarget[];
  times: TimePoint[];
  currentIndex: number;
  shape: AreaShape | null;
  /** Current view as [w, s, e, n] (EPSG:4326), asked for when the job starts. */
  viewBbox: () => [number, number, number, number] | null;
  datasetName: string;
  /** Makes and saves the map PNG; rejects with a reason. */
  onPng: (title: string) => Promise<void>;
}) {
  const { lang, t } = useLanguage();
  const [title, setTitle] = useState(datasetName);
  const titleTouched = useRef(false);
  useEffect(() => {
    if (!titleTouched.current) setTitle(datasetName);
  }, [datasetName]);
  const [pngBusy, setPngBusy] = useState(false);
  const [pngFailure, setPngFailure] = useState<string>("");
  const [kind, setKind] = useState<ExportKind>("GEOTIFF");
  const [targetKey, setTargetKey] = useState(targets[0]?.key ?? "");
  const target = targets.find((item) => item.key === targetKey) ?? targets[0];
  const [variable, setVariable] = useState(target?.variable ?? "");
  const [timeScope, setTimeScope] = useState<TimeScope>("current");
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(Math.max(0, times.length - 1));
  const [areaScope, setAreaScope] = useState<AreaScope>("data");
  const [format, setFormat] = useState<"gif" | "mp4">("gif");
  const [fps, setFps] = useState(2);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [startFailure, setStartFailure] = useState<unknown>(null);
  const [starting, setStarting] = useState(false);
  const targetId = target?.key;
  const targetVariable = target?.variable;
  useEffect(() => {
    if (!targets.some((item) => item.key === targetKey)) setTargetKey(targets[0]?.key ?? "");
  }, [targets, targetKey]);
  useEffect(() => setVariable(targetVariable ?? ""), [targetId, targetVariable]);
  useEffect(() => {
    setStart(0);
    setEnd(Math.max(0, times.length - 1));
  }, [times.length]);
  // Each kind opens on its natural range: a GeoTIFF of the shown time, an animation or report of all times.
  useEffect(() => setTimeScope(kind === "GEOTIFF" ? "current" : "all"), [kind]);
  useEffect(() => {
    if (areaScope === "shape" && !shape) setAreaScope("data");
  }, [areaScope, shape]);

  // Follow running jobs until they end.
  const running = entries.filter((entry) => isExportRunning(entry.job)).map((entry) => String(entry.job.id)).join(",");
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const ids = running.split(",");
      const updates = await Promise.all(ids.map((id) => exportsApi.get(id).then((job) => ({ id, job }), (failure) => ({ id, failure }))));
      if (cancelled) return;
      setEntries((list) =>
        list.map((entry) => {
          const update = updates.find((item) => item.id === String(entry.job.id));
          if (!update) return entry;
          return "job" in update ? { ...entry, job: update.job, failure: undefined } : { ...entry, failure: update.failure };
        }),
      );
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [running, entries]);

  const selectedTimes = (): string[] | "all" => {
    if (timeScope === "all") return "all";
    if (timeScope === "current") return times[currentIndex] ? [times[currentIndex].iso] : "all";
    const [from, to] = start <= end ? [start, end] : [end, start];
    return times.slice(from, to + 1).map((time) => time.iso);
  };
  const frameCount = (() => {
    const chosen = selectedTimes();
    return chosen === "all" ? times.length : chosen.length;
  })();
  const tooManyFrames = kind === "ANIMATION" && frameCount > EXPORT_LIMITS.maxFrames;
  const rangeWrong = timeScope === "range" && start > end;

  const startJob = async () => {
    if (!target || !variable) return;
    setStarting(true);
    setStartFailure(null);
    const bbox = areaScope === "view" ? viewBbox() ?? undefined : areaScope === "shape" ? shape?.bbox : undefined;
    const body: ExportRequest = {
      datasetId: target.datasetId,
      kind,
      variable,
      times: selectedTimes(),
      ...(bbox ? { bbox } : {}),
      ...(kind === "REPORT" && shape && areaScope === "shape" ? { geometry: shape.geometry } : {}),
      ...(kind === "ANIMATION" ? { format, fps } : {}),
      ...(title.trim() ? { title: title.trim() } : {}),
    };
    // Like every other job start (FX-F F4): ask for browser notifications once.
    askOnceOnJobStart();
    try {
      const job = await exportsApi.create(body);
      setEntries((list) => [{ job, kind, format: kind === "ANIMATION" ? format : undefined }, ...list]);
    } catch (cause) {
      setStartFailure(cause ?? new Error());
    } finally {
      setStarting(false);
    }
  };
  const cancel = async (entry: Entry) => {
    try {
      await exportsApi.cancel(entry.job.id);
      setEntries((list) => list.map((item) => (item === entry ? { ...item, job: { ...item.job, status: "CANCELLED" } } : item)));
    } catch (cause) {
      setEntries((list) => list.map((item) => (item === entry ? { ...item, failure: cause } : item)));
    }
  };
  const download = async (entry: Entry) => {
    setEntries((list) => list.map((item) => (item === entry ? { ...item, downloading: true, failure: undefined } : item)));
    try {
      const file = await exportsApi.file(entry.job.id, exportFallbackName(entry.kind, entry.format));
      saveBlob(file.blob, file.fileName);
      setEntries((list) => list.map((item) => (item.job.id === entry.job.id ? { ...item, downloading: false } : item)));
    } catch (cause) {
      setEntries((list) => list.map((item) => (item.job.id === entry.job.id ? { ...item, downloading: false, failure: cause } : item)));
    }
  };
  const makePng = async () => {
    setPngBusy(true);
    setPngFailure("");
    try {
      await onPng(title.trim() || datasetName);
    } catch (cause: any) {
      setPngFailure(cause?.code === "TAINTED" || cause?.message === "TAINTED" ? t("viewer.export.png.tainted") : t("viewer.export.png.failed"));
    } finally {
      setPngBusy(false);
    }
  };

  const kinds: ExportKind[] = ["GEOTIFF", "ANIMATION", "REPORT"];
  return (
    <div className="vx-export">
      <section className="vx-section">
        <label className="vx-field">
          <span>{t("viewer.export.title")}</span>
          <input
            className="vx-input"
            value={title}
            maxLength={120}
            onChange={(event) => {
              titleTouched.current = true;
              setTitle(event.target.value);
            }}
          />
          <small className="vx-section__hint">{t("viewer.export.titleHint")}</small>
        </label>
      </section>
      <section className="vx-section">
        <h3 className="vx-section__title">{t("viewer.export.png.heading")}</h3>
        <p className="vx-section__hint">{t("viewer.export.png.hint")}</p>
        <button type="button" className="vx-btn vx-btn--ink vx-btn--block" onClick={makePng} disabled={pngBusy}>
          {pngBusy ? <LoaderCircle size={16} className="vx-spin" aria-hidden="true" /> : <FileImage size={16} aria-hidden="true" />}
          {pngBusy ? t("viewer.export.png.busy") : t("viewer.export.png.save")}
        </button>
        {pngFailure && <p className="vx-note vx-note--bad" role="alert">{pngFailure}</p>}
      </section>

      <section className="vx-section">
        <h3 className="vx-section__title">{t("viewer.export.job.heading")}</h3>
        <p className="vx-section__hint">{t("viewer.export.job.hint")}</p>
        <div className="vx-seg vx-seg--fit" role="group" aria-label={t("viewer.export.job.kind")}>
          {kinds.map((item) => (
            <button key={item} type="button" aria-pressed={kind === item} onClick={() => setKind(item)}>
              {t(`viewer.export.kind.${item}`)}
            </button>
          ))}
        </div>
        <p className="vx-section__hint">{t(`viewer.export.kindHint.${kind}`)}</p>
        {targets.length > 1 && (
          <div className="vx-seg vx-seg--fit" role="group" aria-label={t("viewer.export.job.target")}>
            {targets.map((item) => (
              <button key={item.key} type="button" aria-pressed={item.key === target?.key} onClick={() => setTargetKey(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
        )}
        {target && (
          <label className="vx-field">
            <span>{t("viewer.export.job.variable")}</span>
            <select value={variable} onChange={(event) => setVariable(event.target.value)}>
              {target.variables.map((name) => (
                <option key={name} value={name}>{name === "rgb" ? t("viewer.legend.rgb") : name}</option>
              ))}
            </select>
          </label>
        )}
        <fieldset className="vx-field">
          <legend>{t("viewer.export.job.times")}</legend>
          <div className="vx-seg vx-seg--fit">
            {(["current", "all", "range"] as TimeScope[]).map((scope) => (
              <button key={scope} type="button" aria-pressed={timeScope === scope} disabled={scope !== "current" && times.length < 2} onClick={() => setTimeScope(scope)}>
                {t(`viewer.export.timeScope.${scope}`)}
              </button>
            ))}
          </div>
          {timeScope === "current" && <small className="vx-section__hint tabular">{times[currentIndex]?.label ?? "—"}</small>}
          {timeScope === "all" && <small className="vx-section__hint tabular">{t("viewer.export.job.timesAll", { count: times.length })}</small>}
          {timeScope === "range" && (
            <div className="vx-range2">
              <label>
                <span className="vx-sr">{t("viewer.export.job.from")}</span>
                <select value={start} onChange={(event) => setStart(Number(event.target.value))}>
                  {times.map((time, index) => (
                    <option key={time.iso} value={index}>{time.label}</option>
                  ))}
                </select>
              </label>
              <span aria-hidden="true">–</span>
              <label>
                <span className="vx-sr">{t("viewer.export.job.to")}</span>
                <select value={end} onChange={(event) => setEnd(Number(event.target.value))}>
                  {times.map((time, index) => (
                    <option key={time.iso} value={index}>{time.label}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {rangeWrong && <small className="vx-results__error">{t("viewer.export.job.rangeWrong")}</small>}
          {tooManyFrames && <small className="vx-results__error">{t("viewer.export.job.tooManyFrames", { max: EXPORT_LIMITS.maxFrames })}</small>}
        </fieldset>
        <fieldset className="vx-field">
          <legend>{t("viewer.export.job.area")}</legend>
          <div className="vx-seg vx-seg--fit">
            {(["data", "view", "shape"] as AreaScope[]).map((scope) => (
              <button key={scope} type="button" aria-pressed={areaScope === scope} disabled={scope === "shape" && !shape} onClick={() => setAreaScope(scope)} title={scope === "shape" && !shape ? t("viewer.export.job.noShape") : undefined}>
                {t(`viewer.export.areaScope.${scope}`)}
              </button>
            ))}
          </div>
          {kind === "REPORT" && <small className="vx-section__hint">{shape && areaScope === "shape" ? t("viewer.export.job.reportStats") : t("viewer.export.job.reportNoStats")}</small>}
        </fieldset>
        {kind === "ANIMATION" && (
          <div className="vx-export__anim">
            <fieldset className="vx-field">
              <legend>{t("viewer.export.job.format")}</legend>
              <div className="vx-seg vx-seg--fit">
                {(["gif", "mp4"] as const).map((item) => (
                  <button key={item} type="button" aria-pressed={format === item} onClick={() => setFormat(item)}>
                    {item.toUpperCase()}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="vx-field">
              <span className="vx-field__row">
                {t("viewer.export.job.fps")}
                <small className="tabular">{t("viewer.export.job.fpsValue", { fps })}</small>
              </span>
              <input type="range" min={EXPORT_LIMITS.fpsMin} max={EXPORT_LIMITS.fpsMax} step={1} value={fps} onChange={(event) => setFps(Number(event.target.value))} aria-valuetext={t("viewer.export.job.fpsValue", { fps })} />
            </label>
          </div>
        )}
        <button type="button" className="vx-btn vx-btn--ink vx-btn--block" onClick={startJob} disabled={starting || !target || !variable || tooManyFrames || rangeWrong}>
          {starting ? t("viewer.export.job.starting") : t("viewer.export.job.start")}
        </button>
        {startFailure != null && <p className="vx-note vx-note--bad" role="alert">{userMessage(startFailure, lang)}</p>}
      </section>

      {entries.length > 0 && (
        <section className="vx-section" aria-labelledby="vx-export-list">
          <h3 className="vx-section__title" id="vx-export-list">{t("viewer.export.list.heading")}</h3>
          <ul className="vx-exports">
            {entries.map((entry) => {
              const status = entry.job.status;
              const progress = Math.max(0, Math.min(100, Number(entry.job.progress ?? 0)));
              return (
                <li key={String(entry.job.id)} className={`vx-run is-${status.toLowerCase()}`}>
                  <div className="vx-run__head">
                    <strong>{t(`viewer.export.kind.${entry.kind}`)}</strong>
                    <span role="status">{t(`viewer.export.status.${status}`)}{isExportRunning(entry.job) ? ` · ${progress}%` : ""}</span>
                  </div>
                  <small title={entry.job.name}>{entry.job.name}</small>
                  {isExportRunning(entry.job) && (
                    <>
                      <span className="vx-run__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={t("viewer.export.list.progress", { kind: t(`viewer.export.kind.${entry.kind}`) })}>
                        <i style={{ transform: `scaleX(${progress / 100})` }} />
                      </span>
                      <button type="button" className="vx-btn vx-btn--quiet" onClick={() => cancel(entry)}>
                        <X size={14} aria-hidden="true" />
                        {t("viewer.export.list.cancel")}
                      </button>
                    </>
                  )}
                  {status === "SUCCEEDED" && (
                    <button type="button" className="vx-btn vx-btn--line" onClick={() => download(entry)} disabled={entry.downloading}>
                      <Download size={15} aria-hidden="true" />
                      {entry.downloading ? t("viewer.export.list.downloading") : t("viewer.export.list.download")}
                    </button>
                  )}
                  {status === "FAILED" && <small className="vx-results__error">{serverText({ code: entry.job.errorCode ?? undefined, params: entry.job.errorParams, message: entry.job.errorMessage ?? undefined }, lang, { fallback: "viewer.export.list.failed" }) || t("viewer.export.list.failed")}</small>}
                  {entry.failure != null && <small className="vx-results__error" role="alert">{userMessage(entry.failure, lang)}</small>}
                </li>
              );
            })}
          </ul>
          <p className="vx-section__hint">
            {t("viewer.export.list.keep")}{" "}
            <a className="vx-link" href="/app/jobs" target="_blank" rel="noopener noreferrer">{t("viewer.export.list.jobs")}</a>
          </p>
        </section>
      )}
    </div>
  );
}
