import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useT } from "../../i18n";
import type { TFunction, TKey } from "../../i18n";
import "../../i18n/viewer";

export type TourStep = {
  /** Value of the data-tour attribute to highlight; missing targets show a centred card. */
  target: string;
  title: string;
  body: string;
  /** Shown instead of nothing when the target is not on screen yet. */
  fallback?: string;
};

/** The Viewer's tour, by its targets; the words are viewer.tour.steps.{target}.* in the screen language. */
export const VIEWER_TOUR_STEPS = ["dataset", "project", "layers", "tools", "timeline", "compare", "ai", "add"] as const;
/** Steps with a fallback line (their target appears only once a dataset is chosen). */
const WITH_FALLBACK: ReadonlyArray<string> = ["timeline", "compare", "ai"];

export function viewerTourSteps(t: TFunction): TourStep[] {
  return VIEWER_TOUR_STEPS.map((target) => ({
    target,
    title: t(`viewer.tour.steps.${target}.title`),
    body: t(`viewer.tour.steps.${target}.body`),
    ...(WITH_FALLBACK.includes(target) ? { fallback: t(`viewer.tour.steps.${target}.fallback` as TKey) } : {}),
  }));
}

const DISMISS_KEY = "xcube-viewer-tour-dismissed";

export function tourDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function saveDismissed(value: boolean) {
  try {
    if (value) localStorage.setItem(DISMISS_KEY, "1");
    else localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* storage unavailable: the tour simply shows again next time */
  }
}

type Rect = { top: number; left: number; width: number; height: number };
const GAP = 12;
const CARD_WIDTH = 340;

export default function ViewerTour({
  steps: givenSteps,
  onClose,
}: {
  /** Custom steps (tests); the Viewer's own tour by default. */
  steps?: TourStep[];
  onClose: () => void;
}) {
  const t = useT();
  const steps = givenSteps ?? viewerTourSteps(t);
  const [index, setIndex] = useState(0);
  const [dontShow, setDontShow] = useState(tourDismissed);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(220);
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  const measure = useCallback(() => {
    const element = document.querySelector<HTMLElement>(
      `[data-tour="${step.target}"]`,
    );
    const box = element?.getBoundingClientRect();
    const next =
      box && box.width > 0 && box.height > 0
        ? { top: box.top, left: box.left, width: box.width, height: box.height }
        : null;
    // Only a real move re-renders, so this can run every frame.
    setRect((current) =>
      current && next &&
      current.top === next.top && current.left === next.left &&
      current.width === next.width && current.height === next.height
        ? current
        : next,
    );
    if (cardRef.current) setCardHeight((height) => cardRef.current?.offsetHeight ?? height);
  }, [step.target]);

  useLayoutEffect(measure, [measure]);
  // The target moves without a window resize: the project name, dataset list and
  // web fonts arrive after the tour opens and change the top bar's widths.
  // Follow it every frame while the tour is open (one rect read per frame).
  useEffect(() => {
    let frame = window.requestAnimationFrame(function follow() {
      measure();
      frame = window.requestAnimationFrame(follow);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [measure]);
  useEffect(() => {
    primaryRef.current?.focus();
  }, [index]);

  const finish = useCallback(() => {
    saveDismissed(dontShow);
    onClose();
  }, [dontShow, onClose]);
  const next = useCallback(
    () => (last ? finish() : setIndex((value) => value + 1)),
    [last, finish],
  );
  const prev = () => setIndex((value) => Math.max(0, value - 1));

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      finish();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      next();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      prev();
    } else if (event.key === "Tab" && cardRef.current) {
      // Keep focus inside the tour card while it is open.
      const items = cardRef.current.querySelectorAll<HTMLElement>(
        "button, input",
      );
      const first = items[0];
      const end = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        end.focus();
      } else if (!event.shiftKey && document.activeElement === end) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const cardWidth = Math.min(CARD_WIDTH, viewportWidth - 32);
  let cardStyle: React.CSSProperties;
  if (rect) {
    // Prefer below, then above, then beside the target; tall targets such as
    // the layer panel get the card at their side so it does not cover them.
    const clampLeft = (value: number) =>
      Math.min(Math.max(16, value), viewportWidth - cardWidth - 16);
    const clampTop = (value: number) =>
      Math.min(Math.max(16, value), viewportHeight - cardHeight - 16);
    const centeredLeft = clampLeft(rect.left + rect.width / 2 - cardWidth / 2);
    const below = rect.top + rect.height + GAP;
    const above = rect.top - GAP - cardHeight;
    const right = rect.left + rect.width + GAP;
    const left = rect.left - GAP - cardWidth;
    if (below + cardHeight <= viewportHeight - 16)
      cardStyle = { top: below, left: centeredLeft, width: cardWidth };
    else if (above >= 16)
      cardStyle = { top: above, left: centeredLeft, width: cardWidth };
    else if (right + cardWidth <= viewportWidth - 16)
      cardStyle = { top: clampTop(rect.top), left: right, width: cardWidth };
    else if (left >= 16)
      cardStyle = { top: clampTop(rect.top), left, width: cardWidth };
    else
      cardStyle = {
        top: clampTop(viewportHeight / 2 - cardHeight / 2),
        left: clampLeft(viewportWidth / 2 - cardWidth / 2),
        width: cardWidth,
      };
  } else {
    cardStyle = {
      top: Math.max(16, viewportHeight / 2 - cardHeight / 2),
      left: viewportWidth / 2 - cardWidth / 2,
      width: cardWidth,
    };
  }

  return (
    <div className="vx-tour" onKeyDown={onKeyDown}>
      {rect ? (
        <div
          className="vx-tour__spot"
          aria-hidden="true"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
          }}
        />
      ) : (
        <div className="vx-tour__shade" aria-hidden="true" />
      )}
      <div
        ref={cardRef}
        className="vx-tour__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vx-tour-title"
        aria-describedby="vx-tour-body"
        style={cardStyle}
      >
        <div className="vx-tour__head">
          <span className="vx-tour__step tabular">
            {index + 1} / {steps.length}
          </span>
          <button
            type="button"
            className="vx-icon-btn"
            onClick={finish}
            aria-label={t("viewer.tour.close")}
            title={t("common.close")}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <h2 id="vx-tour-title" className="vx-tour__title">
          {step.title}
        </h2>
        <p id="vx-tour-body" className="vx-tour__body">
          {step.body}
          {!rect && step.fallback && (
            <span className="vx-tour__fallback">{step.fallback}</span>
          )}
        </p>
        <div className="vx-tour__rule" aria-hidden="true">
          {steps.map((item, dot) => (
            <i
              key={item.target}
              className={dot === index ? "on" : dot < index ? "done" : ""}
            />
          ))}
        </div>
        <div className="vx-tour__foot">
          <label className="vx-tour__check">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(event) => setDontShow(event.target.checked)}
            />
            {t("viewer.tour.dontShow")}
          </label>
          <div className="vx-tour__nav">
            {index > 0 && (
              <button
                type="button"
                className="vx-btn vx-btn--line"
                onClick={prev}
              >
                {t("viewer.tour.prev")}
              </button>
            )}
            <button
              ref={primaryRef}
              type="button"
              className="vx-btn vx-btn--ink"
              onClick={next}
            >
              {t(last ? "viewer.tour.start" : "viewer.tour.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
