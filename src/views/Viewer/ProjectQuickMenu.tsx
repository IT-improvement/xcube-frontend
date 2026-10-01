// Project button popover in the Viewer top bar: quick project actions that do
// not need to leave the map. Full management (members, edit, delete) stays on
// the project page, opened in a new tab so the Viewer state is kept.
import { useEffect, useRef, useState } from "react";
import { ExternalLink, FolderKanban, FolderPlus, Link2 } from "lucide-react";
import { userMessage } from "../../api/httpClient";
import { Project, ZarrDataset } from "../../api/viewerAdapter";
import { appApi, canEditProject } from "../../app/api";

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
    ? "지도에 데이터셋을 먼저 고르세요."
    : !project
      ? "위에서 프로젝트를 먼저 고르세요."
      : !canEditProject(project)
        ? "이 프로젝트에 데이터를 추가할 권한이 없습니다."
        : inProject
          ? "이미 이 프로젝트에 있는 데이터입니다."
          : "";

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("프로젝트 이름을 입력하세요.");
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
      setError(userMessage(cause));
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
      setError(userMessage(cause));
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
        aria-label="프로젝트 관리"
        title="프로젝트"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-pressed={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <FolderKanban size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="vx-pmenu__panel" role="dialog" aria-label="프로젝트 작업">
          <div className="vx-pmenu__head">
            <small>현재 프로젝트</small>
            <strong>{project?.name ?? "프로젝트 없음"}</strong>
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
                    새 프로젝트 만들기
                    <small>만들면 바로 이 프로젝트로 전환합니다.</small>
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
                    지금 보는 데이터를 이 프로젝트에 추가
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
                    프로젝트 관리 열기
                    <small>멤버·권한·수정·삭제 (새 탭)</small>
                  </span>
                </a>
              </li>
            </ul>
          ) : (
            <form className="vx-pmenu__form" onSubmit={create}>
              <label>
                <span>프로젝트 이름</span>
                <input
                  ref={nameRef}
                  value={name}
                  maxLength={150}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="예: 한강 수체 2026"
                />
              </label>
              <label>
                <span>
                  설명 <small>(선택)</small>
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
                  className="vx-btn vx-btn--secondary"
                  onClick={() => {
                    setMode("menu");
                    setError("");
                  }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="vx-btn vx-btn--primary"
                  disabled={busy}
                >
                  {busy ? "만드는 중…" : "만들기"}
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
