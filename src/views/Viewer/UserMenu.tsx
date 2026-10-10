// The one account cluster in the Viewer top bar: who is signed in, the colour theme, the screen
// language and sign-out.
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, LogOut, Moon, Sun } from "lucide-react";
import { LANGS, LANGUAGE_NAMES, useLanguage } from "../../i18n";
import "../../i18n/viewer";

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
  const { lang, setLang, t } = useLanguage();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const items = () =>
    Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[role^='menuitem']") ?? []);
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
        aria-label={t("viewer.user.menu", { name })}
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
        <div className="vx-menu" role="menu" aria-label={t("viewer.user.account")}>
          <p className="vx-menu__who" role="presentation">
            <strong>{name}</strong>
            <small>{t("viewer.user.signedIn")}</small>
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
            {t(dark ? "viewer.user.toLight" : "viewer.user.toDark")}
          </button>
          {/* Each language is named in its own language (UR-53); the group name is in both, so anyone finds it. */}
          <div className="vx-menu__group" role="group" aria-label="언어 · Language">
            {LANGS.map((code) => (
              <button
                key={code}
                type="button"
                role="menuitemradio"
                aria-checked={lang === code}
                lang={code}
                onClick={() => {
                  setLang(code);
                  close();
                }}
              >
                {lang === code ? <Check size={16} aria-hidden="true" /> : <span className="vx-menu__blank" aria-hidden="true" />}
                {LANGUAGE_NAMES[code]}
              </button>
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            aria-label={t("viewer.user.logoutNamed", { name })}
          >
            <LogOut size={16} aria-hidden="true" />
            {t("common.logout")}
          </button>
        </div>
      )}
    </div>
  );
}
