/** One overlay row in the layer panel: visibility toggle and opacity slider. */
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
