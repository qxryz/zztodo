import { useEffect, useRef, useState } from "react";
import type { AppMode } from "../types";

const LABELS: Record<AppMode, string> = {
  projects: "项目管理",
  keys: "Key 管理",
};

/** Brand button in the topbar that doubles as the projects/keys switcher. */
export function ModeSwitch({
  mode,
  onChange,
}: {
  mode: AppMode;
  onChange: (m: AppMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="mode-switch" ref={ref}>
      <button className="mode-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="logo">zz</span>
        <span className="brand-name">{mode === "keys" ? "keys" : "todo"}</span>
        <span className={`mode-caret ${open ? "up" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="mode-menu">
          {(Object.keys(LABELS) as AppMode[]).map((m) => (
            <button
              key={m}
              className={`mode-item ${mode === m ? "active" : ""}`}
              onClick={() => {
                onChange(m);
                setOpen(false);
              }}
            >
              <span className="mode-check">{mode === m ? "✓" : ""}</span>
              {LABELS[m]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
