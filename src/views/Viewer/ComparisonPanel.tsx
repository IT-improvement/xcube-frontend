// Comparison results in the Viewer (UR-63 F3): a COMPARISON dataset is drawn with its class colours, explained by a
// class legend on the map, and its metrics are read in the 결과 비교 tab. The tab also leads to the S9 page to make
// a new comparison with the data on screen filled in.
import { ExternalLink } from "lucide-react";
import { COMPARISON_CLASSES, COMPARISON_ZERO, compareHref } from "../../api/compare";
import type { ComparisonInfo, ComparisonType } from "../../api/compare";
import { formatNumber, useLanguage } from "../../i18n";
import type { Lang } from "../../i18n";
import "../../i18n/viewer";

const area = (value: number | null | undefined, lang: Lang) => (value == null ? "—" : formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, lang));
const ratio = (value: number | null | undefined, lang: Lang) => (value == null ? "—" : formatNumber(value, { minimumFractionDigits: 3, maximumFractionDigits: 3 }, lang));
const signedPercent = (value: number | null | undefined, lang: Lang) =>
  value == null ? "—" : `${value > 0 ? "+" : ""}${formatNumber(value * 100, { minimumFractionDigits: 1, maximumFractionDigits: 1 }, lang)}%`;
const count = (value: number | null | undefined, lang: Lang) => (value == null ? "—" : formatNumber(value, { maximumFractionDigits: 0 }, lang));

/** Area of a TIME_CHANGE class from the metrics, when known. */
function classArea(info: ComparisonInfo, key: string) {
  const areas = info.metrics.areaKm2;
  return key === "kept" ? areas?.kept : key === "gained" ? areas?.gained : key === "lost" ? areas?.lost : undefined;
}

/** Map legend of a comparison: one row per painted class (colour + words), and what class 0 means. */
export function ComparisonLegend({ info, timeLabel }: { info: ComparisonInfo; timeLabel?: string }) {
  const { lang, t } = useLanguage();
  const type = info.type;
  const classes = type ? COMPARISON_CLASSES[type] : [];
  const label = type ? t(`viewer.cmp.type.${type}`) : t("viewer.cmp.unknownType");
  return (
    <div className="vx-legend vx-cbar vx-cmp-legend" role="group" aria-label={t("viewer.cmp.legendAria", { type: label })}>
      <span className="vx-cbar__head">
        <strong>{label}</strong>
        {timeLabel && <span className="tabular">{timeLabel}</span>}
      </span>
      {classes.length ? (
        <ul className="vx-cbar__classes">
          {classes.map((item) => {
            const known = classArea(info, item.key);
            return (
              <li key={item.code}>
                <i style={{ background: item.color }} aria-hidden="true" />
                <span>{t(`viewer.cmp.class.${item.key}`)}</span>
                {known != null && <span className="vx-cmp-legend__area tabular">{area(known, lang)} km²</span>}
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
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt title={hint}>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}

/** Metrics table of a comparison, per type (S9 rules: km² 2 decimals, ratios 3, % 1). */
export function ComparisonMetrics({ info }: { info: ComparisonInfo }) {
  const { lang, t } = useLanguage();
  const m = info.metrics;
  if (info.type === "TIME_CHANGE")
    return (
      <dl className="vx-statgrid">
        <Metric label={`${t("viewer.cmp.class.kept")} (km²)`} value={area(m.areaKm2?.kept, lang)} />
        <Metric label={`${t("viewer.cmp.class.gained")} (km²)`} value={area(m.areaKm2?.gained, lang)} />
        <Metric label={`${t("viewer.cmp.class.lost")} (km²)`} value={area(m.areaKm2?.lost, lang)} />
        <Metric label={t("viewer.cmp.metric.changeRate")} value={signedPercent(m.changeRate, lang)} hint={t("viewer.cmp.metric.changeRateHint")} />
      </dl>
    );
  if (info.type === "MODEL_COMPARE")
    return (
      <dl className="vx-statgrid">
        <Metric label="IoU" value={ratio(m.iou, lang)} />
        <Metric label={t("viewer.cmp.metric.dice")} value={ratio(m.dice, lang)} />
        <Metric label={t("viewer.cmp.metric.agreement")} value={ratio(m.agreement, lang)} />
        <Metric label={`${t("viewer.cmp.metric.areaDiff")} (km²)`} value={area(m.areaDiffKm2, lang)} />
      </dl>
    );
  if (info.type === "REFERENCE")
    return (
      <>
        <dl className="vx-statgrid">
          <Metric label={t("viewer.cmp.metric.precision")} value={ratio(m.precision, lang)} />
          <Metric label={t("viewer.cmp.metric.recall")} value={ratio(m.recall, lang)} />
          <Metric label="F1" value={ratio(m.f1, lang)} />
          <Metric label="IoU" value={ratio(m.iou, lang)} />
          <Metric label="Kappa" value={ratio(m.kappa, lang)} />
        </dl>
        {m.confusion && (
          <table className="vx-confusion">
            <caption>{t("viewer.cmp.confusion")}</caption>
            <thead>
              <tr>
                <td />
                <th scope="col">{t("viewer.cmp.refWater")}</th>
                <th scope="col">{t("viewer.cmp.refDry")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">{t("viewer.cmp.aiWater")}</th>
                <td className="tabular">{count(m.confusion.tp, lang)} <small>TP</small></td>
                <td className="tabular">{count(m.confusion.fp, lang)} <small>FP</small></td>
              </tr>
              <tr>
                <th scope="row">{t("viewer.cmp.aiDry")}</th>
                <td className="tabular">{count(m.confusion.fn, lang)} <small>FN</small></td>
                <td className="tabular">{count(m.confusion.tn, lang)} <small>TN</small></td>
              </tr>
            </tbody>
          </table>
        )}
      </>
    );
  return <p className="vx-section__hint">{t("viewer.cmp.noMetrics")}</p>;
}

/** 결과 비교 tab body for a COMPARISON dataset. */
export function ComparisonPanel({ info, labelOf, datasetName }: { info: ComparisonInfo; labelOf: (iso: string) => string; datasetName: string }) {
  const { t } = useLanguage();
  const type = info.type;
  const when =
    type === "TIME_CHANGE" && info.t1 && info.t2
      ? t("viewer.cmp.whenChange", { t1: labelOf(info.t1), t2: labelOf(info.t2) })
      : info.time
        ? t("viewer.cmp.whenOne", { time: labelOf(info.time) })
        : "";
  return (
    <section className="vx-section">
      <h3 className="vx-section__title">{type ? t(`viewer.cmp.type.${type}`) : t("viewer.cmp.unknownType")}</h3>
      <p className="vx-cmp-what">{type ? t(`viewer.cmp.what.${type}`) : datasetName}</p>
      {when && <p className="vx-section__hint tabular">{when}</p>}
      {type === "REFERENCE" && info.reference && (
        <p className="vx-section__hint">{t("viewer.cmp.reference", { name: info.reference === "water_gt" ? t("viewer.cmp.waterGt") : info.reference })}</p>
      )}
      <ComparisonMetrics info={info} />
    </section>
  );
}

/** Link to the S9 page with the Viewer's data filled in (new tab, like the other management pages). */
export function CompareEntry({ source, result, time, type }: { source?: string; result?: string; time?: string; type?: ComparisonType }) {
  const { t } = useLanguage();
  return (
    <section className="vx-section">
      <h3 className="vx-section__title">{t("viewer.cmp.makeTitle")}</h3>
      <p className="vx-section__hint">{t("viewer.cmp.makeHint")}</p>
      <a className="vx-btn vx-btn--line vx-cmp-make" href={compareHref({ source, result, time, type })} target="_blank" rel="noopener noreferrer">
        {t("viewer.cmp.make")}
        <ExternalLink size={14} aria-hidden="true" />
        <span className="vx-sr">{t("viewer.cmp.newTab")}</span>
      </a>
    </section>
  );
}
