import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { ZarrDataset } from "../../api/viewerAdapter";

/**
 * Searchable combobox for choosing the Zarr shown on the map (owned first, then shared).
 * With a project selected the list is narrowed to that project's data, and one button
 * widens it to all data again.
 */
export default function DatasetPicker({
  datasets,
  value,
  onChange,
  tourId,
  project,
  onUnavailable,
  openRequest = 0,
}: {
  datasets: ZarrDataset[];
  value: string;
  onChange: (value: string) => void;
  tourId?: string;
  /** The selected project and its data, if any. */
  project?: { name: string; items: ZarrDataset[] };
  /** A project item the catalog cannot open yet. */
  onUnavailable?: (item: ZarrDataset) => void;
  /** Increase to open the list from outside (the empty-map hint). */
  openRequest?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [allScope, setAllScope] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = datasets.find((item) => item.id === value);
  const projectScope = !!project && !allScope;
  const source = projectScope ? project!.items : datasets;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return source
      .filter(
        (item) =>
          !needle ||
          [item.name, item.xcubeDatasetId, item.projectName].some((text) =>
            text?.toLowerCase().includes(needle),
          ),
      )
      .sort(
        (a, b) =>
          (a.accessType === "SHARED" ? 1 : 0) -
          (b.accessType === "SHARED" ? 1 : 0),
      );
  }, [source, query]);
  useEffect(() => {
    setAllScope(false);
  }, [project?.name]);
  useEffect(() => {
    if (openRequest > 0) {
      setOpen(true);
      triggerRef.current?.focus();
    }
  }, [openRequest]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => {
    itemRefs.current[active]?.scrollIntoView?.({ block: "nearest" });
  }, [active]);
  const choose = (item: ZarrDataset) => {
    setOpen(false);
    setQuery("");
    if (!datasets.some((known) => known.id === item.id)) {
      onUnavailable?.(item);
      return;
    }
    onChange(item.id);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      if (open) {
        event.stopPropagation();
        triggerRef.current?.focus();
      }
      setOpen(false);
      return;
    }
    if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) =>
        Math.max(
          0,
          Math.min(
            filtered.length - 1,
            current + (event.key === "ArrowDown" ? 1 : -1),
          ),
        ),
      );
    } else if (event.key === "Enter" && filtered[active]) {
      event.preventDefault();
      choose(filtered[active]);
    }
  };
  const ownership = (item: ZarrDataset) =>
    item.accessType === "SHARED" ? "공유받음" : "내 데이터";
  return (
    <div
      className="dataset-picker"
      ref={rootRef}
      onKeyDown={onKeyDown}
      data-tour={tourId}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`dataset-trigger ${selected ? "" : "is-empty"}`}
        role="combobox"
        aria-label="데이터 또는 Zarr 선택"
        aria-expanded={open}
        aria-controls="zarr-listbox"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="dataset-trigger__name">{selected?.name ?? "데이터 고르기"}</span>
        {selected?.accessType === "SHARED" && (
          <small className="dataset-trigger__tag">공유받음</small>
        )}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="dataset-popover">
          <div className="dataset-search">
            <Search size={16} aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              placeholder={projectScope ? `${project!.name}에서 검색` : "이름으로 검색"}
              aria-label="Zarr 검색"
            />
          </div>
          {project && (
            <div className="dataset-scope">
              <span>
                {projectScope ? (
                  <>
                    <strong>{project.name}</strong>의 데이터
                  </>
                ) : (
                  "모든 데이터"
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  setAllScope((current) => !current);
                  setActive(0);
                }}
              >
                {projectScope ? "모든 데이터 보기" : `${project.name}만 보기`}
              </button>
            </div>
          )}
          <div
            id="zarr-listbox"
            className="dataset-list"
            role="listbox"
            aria-label={projectScope ? `${project!.name}의 데이터` : "Zarr 목록"}
          >
            {filtered.length ? (
              filtered.map((item, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={item.id === value}
                  key={item.id}
                  ref={(node) => {
                    itemRefs.current[index] = node;
                  }}
                  className={index === active ? "active-option" : ""}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(item)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      <span>{ownership(item)}</span>
                      {!projectScope && <span>{item.projectName || "프로젝트 없음"}</span>}
                    </small>
                  </span>
                  {item.id === value && (
                    <Check size={16} aria-hidden="true" />
                  )}
                </button>
              ))
            ) : (
              <p className="dataset-empty">
                {projectScope && !query
                  ? "이 프로젝트에 등록된 데이터가 없습니다."
                  : "검색 결과가 없습니다."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
