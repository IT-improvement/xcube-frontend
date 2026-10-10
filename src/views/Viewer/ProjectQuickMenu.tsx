// Project button popover in the Viewer top bar: quick project actions that do
// not need to leave the map. Full management (members, edit, delete) stays on
// the project page, opened in a new tab so the Viewer state is kept.
import { useEffect, useRef, useState } from "react";
import { ExternalLink, FolderKanban, FolderPlus, Link2 } from "lucide-react";
import { userMessage } from "../../api/httpClient";
import { Project, ZarrDataset } from "../../api/viewerAdapter";
import { appApi, canEditProject } from "../../app/api";
import { useLanguage } from "../../i18n";
import "../../i18n/viewer";

type Mode = "menu" | "create";

export default function ProjectQuickMenu({
  project,
  dataset,
  inProject,
  onCreated,
  onLinked,
}: {
  /** The project selected in the top bar, if any. */
  project?: Project;
  /** The dataset shown on the map, if any. */
  dataset: ZarrDataset | null;
  /** Whether that dataset is already listed in the project. */
  inProject: boolean;
  onCreated: (project: Project) => void;
  onLinked: (dataset: ZarrDataset, project: Project) => void;
}) {
  const { lang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("menu");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    setMode("menu");
    setError("");
    buttonRef.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setMode("menu");
        setError("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  useEffect(() => {
    if (mode === "create") nameRef.current?.focus();
  }, [mode]);

  // Why "add to project" is unavailable, or "" when it can run.
  const linkBlocked = !dataset
    ? t("viewer.project.needDataset")
    : !project
      ? t("viewer.project.needProject")
      : !canEditProject(project)
        ? t("viewer.project.noPermission")
        : inProject
          ? t("viewer.project.already")
          : "";

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError(t("viewer.project.nameRequired"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await appApi.createProject({
        name: name.trim(),
        description: description.trim(),
      });
      onCreated(created);
      setName("");
      setDescription("");
      close();
    } catch (cause) {
      setError(userMessage(cause, lang));
    } finally {
      setBusy(false);
    }
  };
  const link = async () => {
    if (linkBlocked || !dataset || !project) return;
    setBusy(true);
    setError("");
    try {
      await appApi.linkDataset(project.id, dataset.id);
      onLinked(dataset, project);
      close();
    } catch (cause) {
      setError(userMessage(cause, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="vx-pmenu"
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="vx-icon-btn"
        aria-label={t("viewer.project.manage")}
        title={t("viewer.project.manageTitle")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-pressed={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <FolderKanban size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="vx-pmenu__panel" role="dialog" aria-label={t("viewer.project.dialog")}>
          <div className="vx-pmenu__head">
            <small>{t("viewer.project.current")}</small>
            <strong>{project?.name ?? t("viewer.project.noProject")}</strong>
          </div>
          {mode === "menu" ? (
            <ul className="vx-pmenu__list">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setMode("create");
                    setError("");
                  }}
                >
                  <FolderPlus size={16} aria-hidden="true" />
                  <span>
                    {t("viewer.project.create")}
                    <small>{t("viewer.project.createHint")}</small>
                  </span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  disabled={!!linkBlocked || busy}
                  aria-describedby="vx-pmenu-link-hint"
                  onClick={link}
                >
                  <Link2 size={16} aria-hidden="true" />
                  <span>
                    {t("viewer.project.link")}
                    <small id="vx-pmenu-link-hint">
                      {linkBlocked ||
                        `“${dataset?.name}” → “${project?.name}”`}
                    </small>
                  </span>
                </button>
              </li>
              <li>
                <a
                  href={
                    project
                      ? `/app/projects/${encodeURIComponent(project.id)}`
                      : "/app/projects"
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => close()}
                >
                  <ExternalLink size={16} aria-hidden="true" />
                  <span>
                    {t("viewer.project.open")}
                    <small>{t("viewer.project.openHint")}</small>
                  </span>
                </a>
              </li>
            </ul>
          ) : (
            <form className="vx-pmenu__form" onSubmit={create}>
              <label>
                <span>{t("viewer.project.name")}</span>
                <input
                  ref={nameRef}
                  value={name}
                  maxLength={150}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("viewer.project.namePlaceholder")}
                />
              </label>
              <label>
                <span>
                  {t("viewer.project.description")} <small>{t("viewer.project.optional")}</small>
                </span>
                <textarea
                  value={description}
                  maxLength={5000}
                  rows={2}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <div className="vx-pmenu__actions">
                <button
                  type="button"
                  className="vx-btn vx-btn--line"
                  onClick={() => {
                    setMode("menu");
                    setError("");
                  }}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  className="vx-btn vx-btn--ink"
                  disabled={busy}
                >
                  {t(busy ? "viewer.project.creating" : "viewer.project.submit")}
                </button>
              </div>
            </form>
          )}
          {error && (
            <p className="vx-pmenu__error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
