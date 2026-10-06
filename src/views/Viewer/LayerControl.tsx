/** One overlay row in the layer sheet: visibility toggle and opacity slider. */
export default function LayerControl({
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
    <div className={`vx-layer-row ${checked ? "" : "is-off"}`}>
      <label className="vx-layer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChecked(e.target.checked)}
        />
        <i className={`vx-swatch vx-swatch--${accent}`} aria-hidden="true" />
        <span>{label}</span>
      </label>
      <label className="vx-opacity">
        <span>불투명도</span>
        <output className="tabular">{opacity}%</output>
        <input
          type="range"
          min="0"
          max="100"
          value={opacity}
          disabled={!checked}
          aria-label={`${label} 불투명도`}
          onChange={(e) => onOpacity(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
