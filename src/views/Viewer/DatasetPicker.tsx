import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Database, Search } from "lucide-react";
import { ZarrDataset } from "../../api/viewerAdapter";

/** Searchable combobox for choosing the Zarr shown on the map (owned first, then shared). */
export default function DatasetPicker({
  datasets,
  value,
  onChange,
  tourId,
}: {
  datasets: ZarrDataset[];
  value: string;
  onChange: (value: string) => void;
  tourId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = datasets.find((item) => item.id === value);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return datasets
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
  }, [datasets, query]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => {
    itemRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
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
      choose(filtered[active].id);
    }
  };
  return (
    <div
      className="dataset-picker"
      ref={rootRef}
      onKeyDown={onKeyDown}
      data-tour={tourId}
    >
      <span className="picker-label">데이터</span>
      <button
        type="button"
        className="dataset-trigger"
        role="combobox"
        aria-label="데이터 또는 Zarr 선택"
        aria-expanded={open}
        aria-controls="zarr-listbox"
        onClick={() => setOpen((value) => !value)}
      >
        <Database size={16} aria-hidden="true" className="dataset-trigger__icon" />
        <span>{selected?.name ?? "데이터셋 선택"}</span>
        {selected && (
          <small className={selected.accessType === "SHARED" ? "shared" : ""}>
            {selected.accessType === "SHARED" ? "공유" : "소유"}
          </small>
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
              placeholder="Zarr 검색"
              aria-label="Zarr 검색"
            />
          </div>
          <div
            id="zarr-listbox"
            className="dataset-list"
            role="listbox"
            aria-label="Zarr 목록"
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
                  onClick={() => choose(item.id)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.accessType === "SHARED" ? "공유" : "소유"} ·{" "}
                      {item.projectName || "프로젝트 없음"}
                    </small>
                  </span>
                  {item.id === value && (
                    <Check size={16} aria-hidden="true" />
                  )}
                </button>
              ))
            ) : (
              <p className="dataset-empty">검색 결과가 없습니다.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
