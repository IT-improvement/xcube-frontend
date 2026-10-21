import { useT } from "../../i18n";
import "../../i18n/viewer";

/** One overlay row in the layer sheet: visibility toggle and opacity slider. */
export default function LayerControl({
  label,
  accent,
  checked,
  onChecked,
  opacity,
  onOpacity,
  swatch,
  parts = "both",
}: {
  label: string;
  accent: string;
  checked: boolean;
  onChecked: (value: boolean) => void;
  opacity: number;
  onOpacity: (value: number) => void;
  /** CSS background drawing the layer's colour ramp; without it the accent colour square. */
  swatch?: string;
  /** VX1: the toggle and the opacity can be laid out apart (toggle up front, opacity folded away). */
  parts?: "both" | "toggle" | "opacity";
}) {
  const t = useT();
  return (
    <div className={`vx-layer-row ${checked ? "" : "is-off"}`}>
      {parts !== "opacity" && (
      <label className="vx-layer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChecked(e.target.checked)}
        />
        <i
          className={`vx-swatch vx-swatch--${accent} ${swatch ? "vx-swatch--ramp" : ""}`}
          style={swatch ? { background: swatch } : undefined}
          aria-hidden="true"
        />
        <span>{label}</span>
      </label>
      )}
      {parts !== "toggle" && (
      <label className={`vx-opacity ${parts === "opacity" ? "vx-opacity--alone" : ""}`}>
        <span>{parts === "opacity" ? label : t("viewer.layer.opacity")}</span>
        <output className="tabular">{opacity}%</output>
        <input
          type="range"
          min="0"
          max="100"
          value={opacity}
          disabled={!checked}
          aria-label={t("viewer.layer.opacityOf", { label })}
          onChange={(e) => onOpacity(Number(e.target.value))}
        />
      </label>
      )}
    </div>
  );
}
