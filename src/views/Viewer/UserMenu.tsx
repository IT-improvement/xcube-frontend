// The one account cluster in the Viewer top bar: who is signed in, the colour theme and sign-out.
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Moon, Sun } from "lucide-react";

export default function UserMenu({
  name,
  theme,
  onToggleTheme,
  onLogout,
}: {
  name: string;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const items = () =>
    Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []);
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const list = items();
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next = (at + (event.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
      list[next]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };
  const dark = theme === "dark";
  return (
    <div className="vx-user" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className="vx-user__button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${name} 계정 메뉴`}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="vx-user__avatar" aria-hidden="true">
          {name.slice(0, 1)}
        </span>
        <span className="vx-user__name" aria-hidden="true">
          {name}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="vx-menu" role="menu" aria-label="계정">
          <p className="vx-menu__who" role="presentation">
            <strong>{name}</strong>
            <small>로그인한 계정</small>
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onToggleTheme();
              close();
            }}
          >
            {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            {dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            aria-label={`${name} 로그아웃`}
          >
            <LogOut size={16} aria-hidden="true" />
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
