import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  onClick?: () => void;
  /** Greyed out — the entry has no value for this field. */
  disabled?: boolean;
  danger?: boolean;
  /** Renders a separator above this item. */
  separatorBefore?: boolean;
  /** Hover-expanded submenu (used for attachments). */
  submenu?: MenuItem[];
  /** Shown when a submenu is empty. */
  submenuEmptyLabel?: string;
}

const MARGIN = 8;

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [openSub, setOpenSub] = useState<number | null>(null);

  // Flip against the viewport edges so the menu is never clipped.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN)),
    });
  }, [x, y]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const run = (item: MenuItem) => {
    if (item.disabled || item.submenu) return;
    item.onClick?.();
    onClose();
  };

  return (
    <div className="ctx-overlay" onMouseDown={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div
        className="ctx-menu"
        ref={ref}
        style={{ left: pos.left, top: pos.top }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {items.map((item, i) => (
          <div key={i} className="ctx-slot" onMouseEnter={() => setOpenSub(item.submenu ? i : null)}>
            {item.separatorBefore && <div className="ctx-sep" />}
            <button
              className={`ctx-item ${item.disabled ? "disabled" : ""} ${
                item.danger ? "danger" : ""
              }`}
              disabled={item.disabled}
              onClick={() => run(item)}
            >
              {item.label}
              {item.submenu && <span className="ctx-arrow">▸</span>}
            </button>

            {item.submenu && openSub === i && (
              <div className="ctx-submenu">
                {item.submenu.length === 0 ? (
                  <span className="ctx-empty">{item.submenuEmptyLabel || "（空）"}</span>
                ) : (
                  item.submenu.map((sub, j) => (
                    <button
                      key={j}
                      className={`ctx-item ${sub.disabled ? "disabled" : ""}`}
                      disabled={sub.disabled}
                      onClick={() => run(sub)}
                    >
                      {sub.label}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
