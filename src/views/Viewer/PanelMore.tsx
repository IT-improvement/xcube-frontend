// VX1 (UR-65): the folded part of a tool panel. Long explanations, research numbers and settings a first-time user
// does not need sit behind one ruled `자세히` row (a native <details>, so the keyboard and screen readers know it).
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export default function PanelMore({
  summary,
  hint,
  children,
  className = "",
  defaultOpen = false,
}: {
  /** The row's words: what is inside. */
  summary: ReactNode;
  /** Optional current values, shown small after the words (e.g. "원본 영상 · blue · 모든 시점 4개"). */
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details className={`vx-more ${className}`} open={defaultOpen || undefined}>
      <summary>
        <span className="vx-more__words">
          <span className="vx-more__title">{summary}</span>
          {hint && <span className="vx-more__hint tabular">{hint}</span>}
        </span>
        <ChevronDown size={16} aria-hidden="true" className="vx-more__chev" />
      </summary>
      <div className="vx-more__body">{children}</div>
    </details>
  );
}
