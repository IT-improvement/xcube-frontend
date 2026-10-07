// The time staff: one ruled axis for the acquisitions. Ticks are the observation times,
// the overprint cursor is time A (the shown time) and, while comparing, a hollow flag marks
// time B on the same axis. The pixel chart above uses the same plot insets, so its points
// sit over these ticks.
import { CSSProperties, useEffect, useRef, useState } from "react";
import { Repeat, SkipBack, SkipForward, SlidersHorizontal } from "lucide-react";

export type StaffTime = { iso: string; label: string };

/** Left and right insets of the plot area, shared with the pixel chart. */
export const PLOT_INSET = { left: 56, right: 16 };

function labelIndexes(count: number) {
  if (count <= 1) return count ? [0] : [];
  if (count <= 6) return Array.from({ length: count }, (_, index) => index);
  return Array.from(
    new Set([0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round((count - 1) * ratio))),
  );
}

const at = (index: number, count: number) =>
  count > 1 ? index / (count - 1) : 0;

export function TimeStaff({
  times,
  index,
  onIndex,
  compareIndex = -1,
}: {
  times: StaffTime[];
  index: number;
  onIndex: (index: number) => void;
  /** Time B while a compare mode is on; -1 otherwise. */
  compareIndex?: number;
}) {
  const count = times.length;
  const comparing = compareIndex >= 0 && compareIndex < count;
  const position = (value: number) =>
    ({ "--at": at(value, count) } as CSSProperties);
  return (
    <div className={`vx-staff ${comparing ? "is-compare" : ""}`}>
      <div className="vx-staff__rule" aria-hidden="true">
        {count <= 120 &&
          times.map((time, tick) => (
            <i
              key={time.iso}
              className={`vx-staff__tick ${tick === index ? "is-a" : ""} ${comparing && tick === compareIndex ? "is-b" : ""}`}
              style={position(tick)}
            />
          ))}
        {labelIndexes(count).map((tick) => (
          <span
            key={times[tick].iso}
            className={`vx-staff__date tabular ${tick === 0 ? "is-first" : ""} ${tick === count - 1 && count > 1 ? "is-last" : ""}`}
            style={position(tick)}
          >
            {times[tick].label}
          </span>
        ))}
        {comparing && (
          <b className="vx-staff__flag vx-staff__flag--b" style={position(compareIndex)}>
            B
          </b>
        )}
        <b
          className={`vx-staff__flag vx-staff__flag--a ${comparing ? "" : "is-bare"}`}
          style={position(index)}
        >
          {comparing ? "A" : ""}
        </b>
      </div>
      <input
        className="vx-staff__range"
        type="range"
        min="0"
        max={Math.max(0, count - 1)}
        value={index}
        onChange={(event) => onIndex(Number(event.target.value))}
        aria-label="관측 시점"
        aria-valuetext={times[index] ? `${times[index].label}, ${index + 1} / ${count}` : undefined}
      />
    </div>
  );
}

/** Less frequent playback settings behind one button: first/last, speed and loop. */
export function PlaybackOptions({
  speed,
  onSpeed,
  loop,
  onLoop,
  onFirst,
  onLast,
}: {
  speed: number;
  onSpeed: (value: number) => void;
  loop: boolean;
  onLoop: (value: boolean) => void;
  onFirst: () => void;
  onLast: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <div
      className="vx-popt"
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="vx-popt__toggle"
        aria-expanded={open}
        aria-controls="vx-playback-options"
        aria-label={`재생 옵션, ${speed}x${loop ? ", 반복" : ""}`}
        title="재생 옵션"
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        <span className="tabular" aria-hidden="true">
          {speed}x
        </span>
        {loop && <Repeat size={14} aria-hidden="true" />}
      </button>
      {open && (
        <div id="vx-playback-options" className="vx-popt__panel" role="group" aria-label="재생 옵션">
          <div className="vx-popt__row">
            <span className="vx-popt__label">이동</span>
            <div className="vx-popt__pair">
              <button type="button" onClick={onFirst} aria-label="첫 시점">
                <SkipBack size={15} aria-hidden="true" />
                처음
              </button>
              <button type="button" onClick={onLast} aria-label="마지막 시점">
                <SkipForward size={15} aria-hidden="true" />
                마지막
              </button>
            </div>
          </div>
          <div className="vx-popt__row">
            <span className="vx-popt__label" id="vx-speed-label">
              재생 속도
            </span>
            <div className="vx-seg" role="group" aria-labelledby="vx-speed-label">
              {[0.5, 1, 2, 4].map((value) => (
                <button
                  type="button"
                  key={value}
                  className="tabular"
                  aria-pressed={speed === value}
                  onClick={() => onSpeed(value)}
                >
                  {value}x
                </button>
              ))}
            </div>
          </div>
          <div className="vx-popt__check">
            <label>
              <input
                type="checkbox"
                checked={loop}
                aria-describedby="vx-loop-hint"
                onChange={(event) => onLoop(event.target.checked)}
              />
              반복
            </label>
            <small id="vx-loop-hint">마지막 시점 다음에 처음으로 돌아가 계속 재생합니다.</small>
          </div>
        </div>
      )}
    </div>
  );
}
