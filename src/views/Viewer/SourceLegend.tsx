// Colour bar legend of the shown source variable (S7): the colour map xcube paints with, its range in
// data units and the variable name; RGB shows which bands make the three channels instead.
import { useEffect, useState } from "react";
import type { ColorBarOption } from "../../api/generationApi";
import { generation } from "../../app/api";

export type LegendStyle = {
  title?: string;
  units?: string;
  colorBarName?: string;
  colorBarNorm?: string;
  colorBarMin?: number;
  colorBarMax?: number;
};

/** Colour previews from xcube `/colorbars` (through Backoffice), asked for once per page. */
let previews: Promise<Record<string, string>> | null = null;
export function colorBarPreviews(): Promise<Record<string, string>> {
  previews ??= generation
    .colorBars()
    .then((items: ColorBarOption[]) =>
      Object.fromEntries(items.filter((item) => typeof item.preview === "string" && item.preview).map((item) => [item.id, item.preview as string])),
    )
    .catch(() => {
      previews = null; // a later legend may try again
      return {};
    });
  return previews;
}
/** Tests reset the cached previews between cases. */
export const resetColorBarPreviews = () => {
  previews = null;
};

/** Matplotlib stops for the maps the catalogue uses most, when xcube's preview is not at hand. */
const STOPS: Record<string, string[]> = {
  viridis: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
  plasma: ["#0d0887", "#7e03a8", "#cc4778", "#f89540", "#f0f921"],
  magma: ["#000004", "#51127c", "#b73779", "#fc8961", "#fcfdbf"],
  inferno: ["#000004", "#56106e", "#bb3754", "#f98e09", "#fcffa4"],
  cividis: ["#00204d", "#414d6b", "#7c7b78", "#bcaf6f", "#ffea46"],
  Blues: ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"],
  Greens: ["#f7fcf5", "#c7e9c0", "#74c476", "#238b45", "#00441b"],
  Reds: ["#fff5f0", "#fcbba1", "#fb6a4a", "#cb181d", "#67000d"],
  Greys: ["#ffffff", "#d9d9d9", "#969696", "#525252", "#000000"],
  gray: ["#000000", "#ffffff"],
  bone: ["#000000", "#545474", "#a7c7c7", "#ffffff"],
  YlGn: ["#ffffe5", "#d9f0a3", "#78c679", "#238443", "#004529"],
  YlGnBu: ["#ffffd9", "#c7e9b4", "#41b6c4", "#225ea8", "#081d58"],
  GnBu: ["#f7fcf0", "#ccebc5", "#7bccc4", "#2b8cbe", "#084081"],
  RdYlGn: ["#a50026", "#f46d43", "#ffffbf", "#66bd63", "#006837"],
  RdYlBu: ["#a50026", "#f46d43", "#ffffbf", "#74add1", "#313695"],
  RdBu: ["#67001f", "#d6604d", "#f7f7f7", "#4393c3", "#053061"],
  Spectral: ["#9e0142", "#f46d43", "#ffffbf", "#66c2a5", "#5e4fa2"],
  terrain: ["#333399", "#00b2b2", "#99eb85", "#ccbe7d", "#ffffff"],
};

/** `Blues_r_alpha` → base "Blues", reversed. */
export function parseColorBar(name?: string) {
  if (!name) return null;
  let base = name.replace(/_alpha$/, "");
  const reversed = base.endsWith("_r");
  if (reversed) base = base.slice(0, -2);
  return { base, reversed };
}

/** A user colour map given as JSON (`{type: "categorical", colors: [[code, colour, label?]]}`), as its classes. */
export function categoriesOf(name?: string): Array<{ code: number; color: string; label?: string }> | null {
  if (!name || !name.trim().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(name) as { type?: string; colors?: unknown };
    if (parsed.type !== "categorical" || !Array.isArray(parsed.colors)) return null;
    const classes = parsed.colors.flatMap((entry) =>
      Array.isArray(entry) && typeof entry[0] === "number" && typeof entry[1] === "string"
        ? [{ code: entry[0], color: entry[1], label: typeof entry[2] === "string" ? entry[2] : undefined }]
        : [],
    );
    return classes.length ? classes : null;
  } catch {
    return null;
  }
}

const valueFormat = new Intl.NumberFormat("ko-KR", { maximumSignificantDigits: 4 });
export const legendValue = (value: number) => valueFormat.format(value);
const CHANNELS = ["빨강", "초록", "파랑"] as const;

/** RGB composite: "빨강 B4 · 초록 B3 · 파랑 B2". */
export const rgbMapping = (bands: string[]) => bands.map((band, index) => `${CHANNELS[index]} ${band}`).join(" · ");

export default function SourceLegend({
  variable,
  style,
  rgbBands,
}: {
  /** Shown variable, or "rgb". */
  variable: string;
  style?: LegendStyle;
  /** Bands of the RGB composite in red, green, blue order. */
  rgbBands?: string[];
}) {
  const [images, setImages] = useState<Record<string, string>>({});
  const colorBar = variable === "rgb" ? null : parseColorBar(style?.colorBarName);
  const classes = variable === "rgb" ? null : categoriesOf(style?.colorBarName);
  const wantsRamp = !!colorBar && !classes;
  useEffect(() => {
    if (!wantsRamp) return;
    let alive = true;
    colorBarPreviews().then((found) => alive && Object.keys(found).length > 0 && setImages(found));
    return () => {
      alive = false;
    };
  }, [wantsRamp]);

  if (variable === "rgb") {
    const mapping = rgbBands?.length === 3 ? rgbMapping(rgbBands) : "";
    return (
      <div className="vx-legend vx-cbar" role="group" aria-label={`원본 범례: RGB 합성${mapping ? `, ${mapping}` : ""}`}>
        <span className="vx-cbar__head">
          <strong>RGB 합성</strong>
        </span>
        <small className="vx-cbar__rgb">{mapping || "빨강·초록·파랑 밴드를 눈으로 보는 색으로 합쳤습니다"}</small>
      </div>
    );
  }

  const units = style?.units && style.units !== "1" ? style.units : "";
  const min = style?.colorBarMin;
  const max = style?.colorBarMax;
  const hasRange = typeof min === "number" && typeof max === "number" && Number.isFinite(min) && Number.isFinite(max);
  const categorical = !!classes || style?.colorBarNorm === "cat";
  const rangeText = hasRange ? `${legendValue(min!)} – ${legendValue(max!)}${units ? ` ${units}` : ""}` : "";
  const label = `원본 범례: ${variable}${categorical ? ", 범주(코드)" : ""}${rangeText ? `, ${categorical ? "코드 " : ""}${rangeText}` : ""}`;
  const image = colorBar ? images[colorBar.base] : undefined;
  const stops = colorBar ? STOPS[colorBar.base] : undefined;

  return (
    <div className="vx-legend vx-cbar" role="group" aria-label={label} title={style?.title ? `${variable} · ${style.title}` : undefined}>
      <span className="vx-cbar__head">
        <strong>{variable}</strong>
        {units && <span>{units}</span>}
      </span>
      {classes ? (
        <ul className="vx-cbar__classes">
          {classes.map((item) => (
            <li key={item.code}>
              <i style={{ background: item.color }} aria-hidden="true" />
              <span className="tabular">{item.label ?? `코드 ${item.code}`}</span>
            </li>
          ))}
        </ul>
      ) : categorical ? (
        hasRange && <small className="tabular">코드 {legendValue(min!)} – {legendValue(max!)}</small>
      ) : (
        <>
          {(image || stops) && (
            <span className={`vx-cbar__ramp ${colorBar?.reversed ? "is-reversed" : ""}`} aria-hidden="true" data-cmap={colorBar?.base}>
              {image ? <img src={`data:image/png;base64,${image}`} alt="" /> : <i style={{ background: `linear-gradient(90deg, ${stops!.join(", ")})` }} />}
            </span>
          )}
          {hasRange ? (
            <span className="vx-cbar__ticks tabular" aria-hidden="true" title="이 범위 밖의 값은 양 끝 색으로 칠합니다">
              <span>{legendValue(min!)}</span>
              <span>{legendValue(max!)}</span>
            </span>
          ) : (
            <small>색 범위 정보 없음</small>
          )}
        </>
      )}
    </div>
  );
}
