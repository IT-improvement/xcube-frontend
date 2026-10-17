// CMP2 (UR-64): comparison results inside the original's 결과 비교 panel. Each card says what kind of comparison it
// is (words + icon, never colour alone), its dates and one key number; it can be put on the map (one at a time),
// opened for the full metrics (the same table as a COMPARISON dataset, plus CSV) and, by its owner, deleted.
// On the map a banner names the comparison shown, a class legend sits bottom-left, and both go with `비교 끄기`.
import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarRange, ChevronDown, Columns2, Download, ExternalLink, Eye, EyeOff, GitCompareArrows, Target, Trash2, Waves, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { COMPARISON_CLASSES, COMPARISON_ZERO, compareHref } from "../../api/compare";
import type { ComparisonType } from "../../api/compare";
import { comparisonCsv, keyMetricOf } from "../../api/originComparisons";
import type { OriginComparison } from "../../api/originComparisons";
import { saveBlob } from "../../api/exports";
import { ConfirmDialog } from "../../components/ui/kit";
import { formatNumber, useLanguage } from "../../i18n";
import type { Lang } from "../../i18n";
import { ComparisonMetrics } from "./ComparisonPanel";
import "../../i18n/viewer";

const TYPE_ICON: Record<ComparisonType, LucideIcon> = { TIME_CHANGE: CalendarRange, MODEL_COMPARE: Columns2, REFERENCE: Target };

const km2 = (value: number, lang: Lang, signed = false) =>
  `${signed && value > 0 ? "+" : ""}${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, lang)}`;
const ratio = (value: number, lang: Lang) => formatNumber(value, { minimumFractionDigits: 3, maximumFractionDigits: 3 }, lang);
const percent = (value: number, lang: Lang) => `${value > 0 ? "+" : ""}${formatNumber(value * 100, { minimumFractionDigits: 1, maximumFractionDigits: 1 }, lang)}%`;

/** "T1 → T2" for a change, "시점 X" otherwise, in the Viewer's date labels. */
export function comparisonWhen(item: OriginComparison, labelOf: (iso: string) => string, t: ReturnType<typeof useLanguage>["t"]) {
  if (item.type === "TIME_CHANGE" && item.times.t1 && item.times.t2) return t("viewer.cmp.whenChange", { t1: labelOf(item.times.t1), t2: labelOf(item.times.t2) });
  const one = item.times.time ?? item.mapTime;
  return one ? t("viewer.cmp.whenOne", { time: labelOf(one) }) : "";
}

/** Type tag: icon + short words. */
export function ComparisonTag({ type }: { type: ComparisonType | null }) {
  const { t } = useLanguage();
  const Icon = type ? TYPE_ICON[type] : GitCompareArrows;
  return (
    <span className="vx-cmptag">
      <Icon size={13} aria-hidden="true" />
      {t(type ? `viewer.cmps.tag.${type}` : "viewer.cmps.tag.unknown")}
    </span>
  );
}

function KeyMetric({ item }: { item: OriginComparison }) {
  const { lang, t } = useLanguage();
  const key = keyMetricOf(item);
  if (!key) return null;
  if (key.kind === "change") {
    if (key.ratio == null && key.km2 == null) return null;
    return (
      <p className="vx-cmpcard__metric">
        <span>{t("viewer.cmps.keyChange")}</span>
        <strong className="tabular">
          {key.ratio != null ? percent(key.ratio, lang) : "—"}
          {key.km2 != null && <small>{` (${km2(key.km2, lang, true)} km²)`}</small>}
        </strong>
      </p>
    );
  }
  if (key.value == null) return null;
  return (
    <p className="vx-cmpcard__metric">
      <span>{key.kind === "iou" ? "IoU" : "F1"}</span>
      <strong className="tabular">{ratio(key.value, lang)}</strong>
    </p>
  );
}

type CardProps = {
  item: OriginComparison;
  shown: boolean;
  canDelete: boolean;
  labelOf: (iso: string) => string;
  onShow: (item: OriginComparison) => void;
  onDelete: (item: OriginComparison) => Promise<void>;
};

function ComparisonCard({ item, shown, canDelete, labelOf, onShow, onDelete }: CardProps) {
  const { t } = useLanguage();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const when = comparisonWhen(item, labelOf, t);
  const inputs = item.sources.map((source) => source.name).filter(Boolean);
  return (
    <li className={`vx-cmpcard${shown ? " is-shown" : ""}`} aria-labelledby={`${id}-name`}>
      <div className="vx-cmpcard__top">
        <ComparisonTag type={item.type} />
        {item.isExample ? <span className="vx-cmpcard__who">{t("viewer.cmps.example")}</span> : item.accessType === "SHARED" && <span className="vx-cmpcard__who">{t("viewer.cmps.shared")}</span>}
        {shown && <span className="vx-cmpcard__on"><Eye size={13} aria-hidden="true" />{t("viewer.cmps.onMap")}</span>}
      </div>
      <h4 id={`${id}-name`} className="vx-cmpcard__name" title={item.name}>{item.name}</h4>
      {when && <p className="vx-cmpcard__when tabular">{when}</p>}
      <KeyMetric item={item} />
      <div className="vx-cmpcard__actions">
        <button type="button" className="vx-btn vx-btn--line" data-cmp-show={item.id} aria-pressed={shown} aria-label={t("viewer.cmps.showAria", { name: item.name })} onClick={() => onShow(item)}>
          {shown ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
          {t(shown ? "viewer.cmps.shown" : "viewer.cmps.show")}
        </button>
        <button type="button" className="vx-btn vx-btn--line" aria-expanded={open} aria-controls={`${id}-details`} aria-label={t("viewer.cmps.detailsAria", { name: item.name })} onClick={() => setOpen((value) => !value)}>
          {t("viewer.cmps.details")}
          <ChevronDown size={15} aria-hidden="true" className="vx-cmpcard__chev" />
        </button>
        {canDelete && (
          <button type="button" className="vx-btn vx-btn--quiet vx-cmpcard__delete" aria-label={t("viewer.cmps.removeAria", { name: item.name })} title={t("viewer.cmps.remove")} onClick={() => setConfirming(true)}>
            <Trash2 size={15} aria-hidden="true" />
            <span className="vx-cmpcard__delete-text">{t("viewer.cmps.remove")}</span>
          </button>
        )}
      </div>
      <div id={`${id}-details`} className="vx-cmpcard__details" hidden={!open}>
        {open && (
          <>
            {inputs.length > 0 && <p className="vx-section__hint">{t("viewer.cmps.inputs", { names: inputs.join(" · ") })}</p>}
            <ComparisonMetrics info={item.info} />
            <button
              type="button"
              className="vx-btn vx-btn--quiet vx-cmpcard__csv"
              onClick={() => saveBlob(new Blob([comparisonCsv(item)], { type: "text/csv;charset=utf-8" }), `${item.name}${t("viewer.cmps.csvSuffix")}.csv`)}
            >
              <Download size={15} aria-hidden="true" />
              {t("viewer.cmps.csv")}
            </button>
          </>
        )}
      </div>
      {/* Portalled so the dialog sits above the tool rail; React events still reach the panel (Esc stops in the dialog). */}
      {confirming && createPortal(
        <ConfirmDialog
          title={t("viewer.cmps.removeTitle")}
          description={t("viewer.cmps.removeText", { name: item.name })}
          confirmLabel={t("viewer.cmps.remove")}
          busyLabel={t("viewer.cmps.removeBusy")}
          onConfirm={async () => {
            await onDelete(item);
            setConfirming(false);
          }}
          onClose={() => setConfirming(false)}
        />,
        document.body,
      )}
    </li>
  );
}

type ListProps = {
  /** null: comparisons could not be read (no API yet); undefined: still loading. */
  items: OriginComparison[] | null | undefined;
  shownId: string | null;
  canDelete: (item: OriginComparison) => boolean;
  labelOf: (iso: string) => string;
  onShow: (item: OriginComparison) => void;
  onDelete: (item: OriginComparison) => Promise<void>;
  /** AI result to fill in on S9 (none: the empty state leads to AI water extraction first). */
  resultId?: string;
  time?: string;
  onGoAi: () => void;
  aiLocked?: string;
};

/** The second group of 결과 비교: 비교 분석 결과 (n개) — cards, or what to do when there are none. */
export function ComparisonGroup({ items, shownId, canDelete, labelOf, onShow, onDelete, resultId, time, onGoAi, aiLocked }: ListProps) {
  const { t } = useLanguage();
  const list = items ?? [];
  const makeLink = (
    <a className="vx-btn vx-btn--line vx-cmp-make" href={compareHref({ resultId, time })} target="_blank" rel="noopener noreferrer">
      <GitCompareArrows size={15} aria-hidden="true" />
      {t("viewer.cmps.make")}
      <ExternalLink size={13} aria-hidden="true" />
      <span className="vx-sr">{t("viewer.cmp.newTab")}</span>
    </a>
  );
  return (
    <section className="vx-section vx-resgroup" aria-labelledby="vx-cmps-title">
      <h3 id="vx-cmps-title" tabIndex={-1} className="vx-resgroup__title">
        {items === undefined ? t("viewer.cmps.groupPlain") : t("viewer.cmps.group", { count: list.length })}
      </h3>
      {items === undefined ? (
        <p className="vx-section__hint" role="status">{t("viewer.cmps.loading")}</p>
      ) : list.length ? (
        <>
          <ul className="vx-cmplist">
            {list.map((item) => (
              <ComparisonCard
                key={item.id}
                item={item}
                shown={shownId === item.id}
                canDelete={canDelete(item)}
                labelOf={labelOf}
                onShow={onShow}
                onDelete={onDelete}
              />
            ))}
          </ul>
          {resultId && makeLink}
        </>
      ) : (
        <div className="vx-cmpempty">
          <p>{t("viewer.cmps.empty")}</p>
          {resultId ? (
            makeLink
          ) : (
            <>
              <p className="vx-section__hint">{t("viewer.cmps.needAi")}</p>
              <button type="button" className="vx-btn vx-btn--line vx-cmp-make" onClick={onGoAi} aria-disabled={aiLocked ? "true" : undefined} title={aiLocked}>
                <Waves size={15} aria-hidden="true" />
                {t("viewer.cmps.toAi")}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** Over the map while a comparison is shown: what it is, when, and the way to turn it off. */
export function ComparisonBanner({ item, labelOf, onOff }: { item: OriginComparison; labelOf: (iso: string) => string; onOff: () => void }) {
  const { t } = useLanguage();
  const when = comparisonWhen(item, labelOf, t);
  return (
    <div className="vx-cmpbar" role="group" aria-label={t("viewer.cmps.bannerLabel")}>
      <ComparisonTag type={item.type} />
      <p className="vx-cmpbar__text">
        <span className="vx-cmpbar__lead">{t("viewer.cmps.bannerLabel")}:</span>{" "}
        <strong title={item.name}>{item.name}</strong>
        {when && <> · <span className="tabular vx-cmpbar__when">{when}</span></>}
        {item.type === "TIME_CHANGE" && <small className="vx-cmpbar__note">{t("viewer.cmps.timeFree")}</small>}
      </p>
      <button type="button" className="vx-btn vx-btn--ink vx-cmpbar__off" onClick={onOff}>
        <X size={15} aria-hidden="true" />
        {t("viewer.cmps.off")}
      </button>
    </div>
  );
}

/** Class legend of the comparison on the map: colour + words + km² per class; it folds away on small screens. */
export function ComparisonMapLegend({ item }: { item: OriginComparison }) {
  const { lang, t } = useLanguage();
  const [open, setOpen] = useState(true);
  const id = useId();
  const type = item.type;
  const classes = type ? COMPARISON_CLASSES[type] : [];
  const label = type ? t(`viewer.cmp.type.${type}`) : t("viewer.cmp.unknownType");
  return (
    <div className="vx-legend vx-cbar vx-cmp-legend" role="group" aria-label={t("viewer.cmp.legendAria", { type: label })}>
      <button type="button" className="vx-cmp-legend__toggle" aria-expanded={open} aria-controls={`${id}-classes`} onClick={() => setOpen((value) => !value)}>
        <strong>{label}</strong>
        <span className="vx-sr">{t(open ? "viewer.cmps.legendHide" : "viewer.cmps.legendShow")}</span>
        <ChevronDown size={14} aria-hidden="true" className="vx-cmp-legend__chev" />
      </button>
      <div id={`${id}-classes`} hidden={!open}>
        {classes.length ? (
          <ul className="vx-cbar__classes">
            {classes.map((entry) => {
              const area = item.classAreas[entry.key];
              return (
                <li key={entry.code}>
                  <i style={{ background: item.classColors[entry.key] ?? entry.color }} aria-hidden="true" />
                  <span>{t(`viewer.cmp.class.${entry.key}`)}</span>
                  {area != null && <span className="vx-cmp-legend__area tabular">{km2(area, lang)} km²</span>}
                </li>
              );
            })}
            <li className="is-zero">
              <i aria-hidden="true" />
              <span>{t("viewer.cmp.zero", { name: t(`viewer.cmp.class.${COMPARISON_ZERO[type!]}`) })}</span>
            </li>
          </ul>
        ) : (
          <small>{t("viewer.cmp.unknownClasses")}</small>
        )}
      </div>
    </div>
  );
}

const SEEN_KEY = "xcube.viewer.seenComparisons";
/** Comparison ids this browser has already shown in 결과 비교 (for the rail's "새 결과" dot). */
export function seenComparisons(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.map(String) : []);
  } catch {
    return new Set();
  }
}
export function markComparisonsSeen(ids: string[]) {
  if (!ids.length) return;
  try {
    const seen = seenComparisons();
    ids.forEach((id) => seen.add(id));
    // Keep the newest few hundred so the key stays small.
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen).slice(-500)));
  } catch {
    /* storage unavailable: the dot just shows again next time */
  }
}
