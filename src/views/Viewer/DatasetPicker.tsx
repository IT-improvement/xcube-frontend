import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, LayoutGrid, List, Search } from "lucide-react";
import { ZarrDataset } from "../../api/viewerAdapter";
import { kindIdOf, shortPeriod, TimeKind, timeKindOf } from "../../api/datasetFacts";
import { isExample } from "../../api/examples";
import DatasetThumb from "../../components/thumb/DatasetThumb";
import { useViewMode, VIEW_KEYS, ViewMode } from "../../hooks/useViewMode";
import { useT } from "../../i18n";
import "../../i18n/viewer";

// Mine, then shared with me, then examples: the list groups follow this order.
const rank = (item: ZarrDataset) => (isExample(item) ? 2 : item.accessType === "SHARED" ? 1 : 0);

const coarsePointer = () =>
  typeof window.matchMedia === "function" && !!window.matchMedia("(pointer: coarse)")?.matches;

/**
 * Searchable combobox for choosing the Zarr shown on the map (owned first, then shared).
 * With a project selected the list is narrowed to that project's data, and one button
 * widens it to all data again. Each row shows its preview picture and one line of facts
 * (kind · single date or time series · period · bands), and a filter keeps only series or
 * single dates (FB1 §3).
 *
 * RD1: the list is shown as picture cards (default) or as large rows, remembered per browser. It is split into
 * groups (my data, shared with me, or the chosen project), and the arrow keys move through cards by rows:
 * ↑/↓ to the card above or below, ←/→ to the previous or next one (while the search field is empty).
 */

/** Index of the card straight above or below `from` in a wrapped grid, by the cards' positions on screen. */
function verticalNeighbour(nodes: Array<HTMLElement | null>, from: number, step: 1 | -1): number {
  const boxes = nodes.map((node) => node?.getBoundingClientRect());
  const here = boxes[from];
  const fallback = Math.max(0, Math.min(nodes.length - 1, from + step));
  // Without layout (tests) or with one column every card is its own row.
  if (!here || boxes.every((box) => !box || box.top === here.top)) return fallback;
  const centre = here.left + here.width / 2;
  let best = -1;
  let bestRow = Infinity;
  let bestDistance = Infinity;
  boxes.forEach((box, index) => {
    if (!box || index === from) return;
    const rowGap = step === 1 ? box.top - here.top : here.top - box.top;
    if (rowGap <= 2) return;
    const distance = Math.abs(box.left + box.width / 2 - centre);
    if (rowGap < bestRow - 2 || (Math.abs(rowGap - bestRow) <= 2 && distance < bestDistance)) {
      best = index;
      bestRow = rowGap;
      bestDistance = distance;
    }
  });
  return best >= 0 ? best : from;
}
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
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [allScope, setAllScope] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeKind | "">("");
  const [view, setView] = useViewMode(VIEW_KEYS.picker);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = datasets.find((item) => item.id === value);
  const projectScope = !!project && !allScope;
  const source = projectScope ? project!.items : datasets;
  const searched = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return source.filter(
      (item) =>
        !needle ||
        [item.name, item.xcubeDatasetId, item.projectName].some((text) =>
          text?.toLowerCase().includes(needle),
        ),
    );
  }, [source, query]);
  const timeCounts = useMemo(
    () => ({ series: searched.filter((item) => timeKindOf(item) === "series").length, single: searched.filter((item) => timeKindOf(item) === "single").length }),
    [searched],
  );
  const filtered = useMemo(() => {
    return searched
      .filter((item) => !timeFilter || timeKindOf(item) === timeFilter)
      .sort((a, b) => rank(a) - rank(b));
  }, [searched, timeFilter]);
  useEffect(() => {
    setAllScope(false);
  }, [project?.name]);
  // FIX4: closing without choosing (Esc, a click outside, the trigger) drops the search, so the list opens whole.
  useEffect(() => {
    if (open) return;
    setQuery("");
    setActive(0);
  }, [open]);
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
  // Only the keyboard scrolls the list to the active item; a pointer hovering an item must not move the list under it.
  const hoverActiveRef = useRef(false);
  useEffect(() => {
    if (hoverActiveRef.current) {
      hoverActiveRef.current = false;
      return;
    }
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
    // Buttons inside the list (scope, filter) keep Enter and Space for themselves.
    const target = event.target as HTMLElement;
    if (open && target.tagName === "BUTTON" && target !== triggerRef.current && target.getAttribute("role") !== "option" && (event.key === "Enter" || event.key === " ")) return;
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
    const step = (by: number) => (current: number) => Math.max(0, Math.min(filtered.length - 1, current + by));
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const by = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) =>
        view === "grid" ? verticalNeighbour(itemRefs.current.slice(0, filtered.length), current, by) : step(by)(current),
      );
    } else if (
      view === "grid" &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
      // In the search field the side arrows move the caret once something is typed.
      !(target instanceof HTMLInputElement && target.value)
    ) {
      event.preventDefault();
      setActive(step(event.key === "ArrowRight" ? 1 : -1));
    } else if (event.key === "Enter" && filtered[active]) {
      event.preventDefault();
      choose(filtered[active]);
    }
  };
  // Example data (UR-63) reaches everyone as SHARED; name it as an example, not as something shared with you.
  const ownership = (item: ZarrDataset) =>
    t(isExample(item) ? "viewer.picker.example" : item.accessType === "SHARED" ? "viewer.picker.shared" : "viewer.picker.mine");
  const timeText = (item: ZarrDataset) =>
    timeKindOf(item) === "series" ? t("datasetFacts.series", { count: item.times.length }) : t("datasetFacts.single");
  const filterItems: Array<{ id: TimeKind | ""; label: string; count: number }> = [
    { id: "", label: t("datasetFacts.filter.all"), count: searched.length },
    { id: "series", label: t("datasetFacts.filter.series"), count: timeCounts.series },
    { id: "single", label: t("datasetFacts.filter.single"), count: timeCounts.single },
  ];
  const viewItems: Array<{ id: ViewMode; label: string; icon: React.ReactNode }> = [
    { id: "grid", label: t("datasetFacts.view.grid"), icon: <LayoutGrid size={14} aria-hidden="true" /> },
    { id: "list", label: t("datasetFacts.view.list"), icon: <List size={14} aria-hidden="true" /> },
  ];
  // Groups in list order (filtered already puts my data before shared data); each keeps its flat index.
  const indexed = filtered.map((item, index) => ({ item, index }));
  const groups: Array<{ id: string; title: string; items: typeof indexed }> = projectScope
    ? [{ id: "project", title: t("viewer.picker.groupProject", { name: project!.name }), items: indexed }]
    : [
        { id: "mine", title: t("viewer.picker.groupMine"), items: indexed.filter(({ item }) => item.accessType !== "SHARED") },
        { id: "shared", title: t("viewer.picker.groupShared"), items: indexed.filter(({ item }) => item.accessType === "SHARED" && !isExample(item)) },
        { id: "example", title: t("viewer.picker.groupExample"), items: indexed.filter(({ item }) => isExample(item)) },
      ].filter((group) => group.items.length > 0);
  const facts = (item: ZarrDataset) => (
    <small className="dataset-facts">
      {view === "list" && <span className={`dataset-kind dataset-kind--${kindIdOf(item)}`}>{t(`datasetFacts.kinds.${kindIdOf(item)}`)}</span>}
      <span>{timeText(item)}</span>
      {shortPeriod(item) && <span className="dataset-facts__num">{shortPeriod(item)}</span>}
      {item.variables.length > 0 && <span>{t("datasetFacts.bands", { count: item.variables.length })}</span>}
    </small>
  );
  // The third line names the project only where it adds something: outside a project scope, for linked data.
  // Inside the project group, shared data still says so.
  const where = (item: ZarrDataset) => {
    const text = projectScope
      ? item.accessType === "SHARED" ? ownership(item) : ""
      : item.projectName || "";
    return text ? <small className="dataset-where"><span>{text}</span></small> : null;
  };
  const option = (item: ZarrDataset, index: number) => {
    const chosen = item.id === value;
    return (
      <button
        type="button"
        role="option"
        id={`zarr-option-${index}`}
        tabIndex={-1}
        aria-selected={chosen}
        key={item.id}
        ref={(node) => {
          itemRefs.current[index] = node;
        }}
        className={`dataset-option dataset-option--${view} ${index === active ? "active-option" : ""}`}
        onMouseEnter={() => {
          if (index === active) return;
          hoverActiveRef.current = true;
          setActive(index);
        }}
        onClick={() => choose(item)}
      >
        {view === "grid" ? (
          <>
            <span className="dataset-card__pic">
              <DatasetThumb dataset={item} size={140} request={256} className="dataset-card__thumb" />
              <span className={`dataset-kind dataset-kind--${kindIdOf(item)}`}>{t(`datasetFacts.kinds.${kindIdOf(item)}`)}</span>
              {chosen && (
                <span className="dataset-card__check">
                  <Check size={14} aria-hidden="true" />
                </span>
              )}
            </span>
            <span className="dataset-option__text">
              <strong>{item.name}</strong>
              {facts(item)}
              {where(item)}
            </span>
          </>
        ) : (
          <>
            <DatasetThumb dataset={item} size={88} request={256} />
            <span className="dataset-option__text">
              <strong>{item.name}</strong>
              {facts(item)}
              {where(item)}
            </span>
            {chosen && <Check size={18} aria-hidden="true" />}
          </>
        )}
      </button>
    );
  };
  // "{name}의 데이터" / "Data in {name}" with the project name in bold.
  const [scopeBefore, scopeAfter = ""] = t("viewer.picker.projectData").split("{name}");
  return (
    <div
      className="dataset-picker"
      ref={rootRef}
      onKeyDown={onKeyDown}
      data-tour={tourId}
    >
      {/* The trigger names its purpose and the data now shown (UX13); the search field below is the combobox. */}
      <span id="dataset-trigger-label" className="vx-sr">{t("viewer.picker.trigger")}</span>
      <button
        ref={triggerRef}
        type="button"
        className={`dataset-trigger ${selected ? "" : "is-empty"}`}
        aria-haspopup="listbox"
        aria-labelledby="dataset-trigger-label dataset-trigger-name"
        aria-expanded={open}
        aria-controls={open ? "zarr-listbox" : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span id="dataset-trigger-name" className="dataset-trigger__name">{selected?.name ?? t("viewer.picker.placeholder")}</span>
        {selected?.accessType === "SHARED" && (
          <small className="dataset-trigger__tag">{ownership(selected)}</small>
        )}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="dataset-popover">
          <div className="dataset-search">
            <Search size={16} aria-hidden="true" />
            <input
              // A touch keyboard would cover the list at once; touch users tap the field when they want to type.
              autoFocus={!coarsePointer()}
              role="combobox"
              aria-expanded={true}
              aria-controls="zarr-listbox"
              aria-autocomplete="list"
              aria-activedescendant={filtered[active] ? `zarr-option-${active}` : undefined}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              placeholder={projectScope ? t("viewer.picker.searchIn", { name: project!.name }) : t("viewer.picker.search")}
              aria-label={t("viewer.picker.searchAria")}
            />
          </div>
          {project && (
            <div className="dataset-scope">
              <span>
                {projectScope ? (
                  <>
                    {scopeBefore}<strong>{project.name}</strong>{scopeAfter}
                  </>
                ) : (
                  t("viewer.picker.all")
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  setAllScope((current) => !current);
                  setActive(0);
                }}
              >
                {projectScope ? t("viewer.picker.showAll") : t("viewer.picker.onlyProject", { name: project.name })}
              </button>
            </div>
          )}
          <div className="dataset-tools">
            <div className="dataset-filter" role="group" aria-label={t("datasetFacts.filter.label")}>
              {filterItems.map((item) => (
                <button
                  key={item.id || "all"}
                  type="button"
                  aria-pressed={timeFilter === item.id}
                  onClick={() => {
                    setTimeFilter(item.id);
                    setActive(0);
                  }}
                >
                  {item.label} <span className="dataset-filter__count">{item.count}</span>
                </button>
              ))}
            </div>
            <div className="dataset-filter dataset-view" role="group" aria-label={t("datasetFacts.view.label")}>
              {viewItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={view === item.id}
                  aria-label={item.label}
                  title={item.label}
                  onClick={() => setView(item.id)}
                >
                  {item.icon}
                  <span className="dataset-view__word" aria-hidden="true">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div
            id="zarr-listbox"
            className={`dataset-list dataset-list--${view}`}
            role="listbox"
            aria-label={projectScope ? t("viewer.picker.projectData", { name: project!.name }) : t("viewer.picker.list")}
          >
            {filtered.length ? (
              groups.map((group) => (
                <div key={group.id} role="group" aria-labelledby={`zarr-group-${group.id}`} className="dataset-group">
                  <div id={`zarr-group-${group.id}`} className="dataset-group__head">
                    <span>{group.title}</span>
                    <span className="dataset-group__count">{t("viewer.picker.groupCount", { count: group.items.length })}</span>
                  </div>
                  <div className="dataset-group__items">
                    {group.items.map(({ item, index }) => option(item, index))}
                  </div>
                </div>
              ))
            ) : (
              <p className="dataset-empty">
                {t(projectScope && !query ? "viewer.picker.emptyProject" : "viewer.picker.noMatch")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
