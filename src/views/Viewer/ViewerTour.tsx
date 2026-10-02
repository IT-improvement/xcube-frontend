import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export type TourStep = {
  /** Value of the data-tour attribute to highlight; missing targets show a centred card. */
  target: string;
  title: string;
  body: string;
  /** Shown instead of nothing when the target is not on screen yet. */
  fallback?: string;
};

export const VIEWER_TOUR_STEPS: TourStep[] = [
  {
    target: "dataset",
    title: "데이터셋 선택",
    body: "Zarr 데이터셋을 검색해 고릅니다. 내 데이터와 공유받은 데이터가 함께 나옵니다.",
  },
  {
    target: "project",
    title: "프로젝트",
    body: "프로젝트를 고르면 그 프로젝트의 데이터만 모아 보여 줍니다. 오른쪽 위 폴더 버튼으로 새 프로젝트를 만들거나 지금 보는 데이터를 프로젝트에 추가합니다.",
  },
  {
    target: "layers",
    title: "레이어 패널",
    body: "원본·AI 결과 레이어를 켜고 끄며 투명도를 조절합니다. 표시할 band도 여기서 고릅니다.",
  },
  {
    target: "tools",
    title: "지도 도구",
    body: "픽셀 조회 도구를 켜고 지도를 클릭하면 그 지점의 전체 시계열 그래프가 아래에 열립니다.",
  },
  {
    target: "timeline",
    title: "타임라인",
    body: "시점을 넘기거나 재생합니다. 속도와 반복을 바꿀 수 있고, 그래프의 현재 시점 선도 함께 움직입니다. 키보드 ←/→로 시점을 넘기고 Space로 재생합니다.",
    fallback: "데이터셋을 고르면 화면 아래에 나타납니다.",
  },
  {
    target: "compare",
    title: "시점 비교",
    body: "스와이프는 구분선을 끌어 A(현재 시점)와 B 시점을 겹쳐 보고, 나란히는 두 지도를 함께 움직이며 비교합니다. 화면 상태는 주소에 저장되어 새로고침하거나 링크로 공유해도 그대로 열립니다.",
    fallback: "데이터셋을 고르면 지도 오른쪽 위에 나타납니다.",
  },
  {
    target: "ai",
    title: "AI 수체 추출",
    body: "선택한 데이터셋으로 수체 추출을 실행하고, 결과가 있으면 '결과'에서 원본과 겹쳐 비교합니다.",
    fallback: "데이터셋을 고르면 상단에 버튼이 나타납니다.",
  },
  {
    target: "add",
    title: "데이터 추가",
    body: "GeoTIFF·Shapefile·GEE로 새 Zarr를 만들거나 이미 있는 Zarr를 등록합니다. 새 탭에서 열리고, 끝나고 Viewer로 돌아오면 목록이 자동으로 갱신됩니다.",
  },
];

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
  steps = VIEWER_TOUR_STEPS,
  onClose,
}: {
  steps?: TourStep[];
  onClose: () => void;
}) {
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
    setRect(
      box && box.width > 0 && box.height > 0
        ? { top: box.top, left: box.left, width: box.width, height: box.height }
        : null,
    );
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [step.target]);

  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
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
            aria-label="둘러보기 닫기"
            title="닫기"
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
        <div className="vx-tour__dots" aria-hidden="true">
          {steps.map((item, dot) => (
            <i key={item.target} className={dot === index ? "on" : ""} />
          ))}
        </div>
        <div className="vx-tour__foot">
          <label className="vx-tour__check">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(event) => setDontShow(event.target.checked)}
            />
            다시 보지 않기
          </label>
          <div className="vx-tour__nav">
            {index > 0 && (
              <button
                type="button"
                className="vx-btn vx-btn--secondary"
                onClick={prev}
              >
                이전
              </button>
            )}
            <button
              ref={primaryRef}
              type="button"
              className="vx-btn vx-btn--primary"
              onClick={next}
            >
              {last ? "시작하기" : "다음"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
