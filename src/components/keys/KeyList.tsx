import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Project } from "../../types";
import { vaultApi } from "../../vault/api";
import { copySecret, copyText, SECRET_TTL_SECONDS } from "../../vault/clipboard";
import {
  FIXED_TAGS,
  formatBytes,
  type EntryMeta,
  type FixedTag,
  type VaultStatus,
} from "../../vault/types";
import { COL_KEYS, DEFAULT_COL_WIDTHS, type ColKey } from "../../vault/useKeyColumnWidths";
import { KeyRow } from "./KeyRow";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { KeyEditor } from "./KeyEditor";

interface MenuAnchor {
  x: number;
  y: number;
  entry: EntryMeta;
}

export function KeyList({
  status,
  projects,
  onStatus,
  columnWidths,
  onColumnResize,
  columnLinesVisible,
}: {
  status: VaultStatus;
  projects: Project[];
  onStatus: (s: VaultStatus) => void;
  columnWidths: Record<ColKey, number>;
  onColumnResize: (key: ColKey, value: number) => void;
  columnLinesVisible: boolean;
}) {
  const [entries, setEntries] = useState<EntryMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<number | "all">("all");
  const [customTagFilter, setCustomTagFilter] = useState<string | "all">("all");
  const [paymentFilter, setPaymentFilter] = useState<FixedTag | "all">("all");
  const [selected, setSelected] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [editing, setEditing] = useState<EntryMeta | "new" | null>(null);
  const [toast, setToast] = useState("");

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  };

  const refresh = async () => {
    try {
      setEntries(await vaultApi.listEntries());
      onStatus(await vaultApi.status());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (projectFilter !== "all" && !e.project_ids.includes(projectFilter)) return false;
      if (customTagFilter !== "all" && !e.tags.includes(customTagFilter)) return false;
      if (paymentFilter !== "all" && !e.tags.includes(paymentFilter)) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.purpose.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q) ||
        e.env_var.toLowerCase().includes(q) ||
        e.model_id.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [entries, query, projectFilter, customTagFilter, paymentFilter]);

  // Only projects that actually have keys are worth offering as filters.
  const usedProjects = useMemo(() => {
    const ids = new Set(entries.flatMap((e) => e.project_ids));
    return projects.filter((p) => ids.has(p.id));
  }, [entries, projects]);

  const projectOptions = useMemo(
    () =>
      usedProjects.map((p) => ({
        value: p.id,
        label: p.name,
        count: entries.filter((e) => e.project_ids.includes(p.id)).length,
      })),
    [usedProjects, entries],
  );

  const customTagOptions = useMemo(() => {
    const counts = new Map<string, number>();
    entries.forEach((e) =>
      e.tags.forEach((t) => {
        if (!(FIXED_TAGS as string[]).includes(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
      }),
    );
    return [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, label: `#${value}`, count }));
  }, [entries]);

  const paymentOptions = useMemo(() => {
    const counts = new Map<FixedTag, number>();
    entries.forEach((e) =>
      e.tags.forEach((t) => {
        if ((FIXED_TAGS as string[]).includes(t)) {
          const ft = t as FixedTag;
          counts.set(ft, (counts.get(ft) ?? 0) + 1);
        }
      }),
    );
    return FIXED_TAGS.filter((t) => counts.has(t)).map((value) => ({
      value,
      label: value,
      count: counts.get(value)!,
    }));
  }, [entries]);

  const copyField = (label: string, value: string) => async () => {
    await copyText(value);
    flash(`已复制${label}`);
  };

  const copyKeySecret = (entry: EntryMeta) => async () => {
    try {
      const secret = await vaultApi.getSecret(entry.id);
      if (!secret) {
        flash("该条目没有密码");
        return;
      }
      await copySecret(secret);
      flash(`已复制密码，${SECRET_TTL_SECONDS} 秒后自动清除剪贴板`);
    } catch (e) {
      flash(String(e));
    }
  };

  const open = (url: string) => async () => {
    await openUrl(url).catch(() => flash("无法打开链接"));
  };

  const saveAttachment = (entry: EntryMeta, name: string) => async () => {
    try {
      const dest = await save({ defaultPath: name });
      if (typeof dest === "string") {
        await vaultApi.saveAttachmentTo(entry.id, name, dest);
        flash(`已另存 ${name}`);
      }
    } catch (e) {
      flash(String(e));
    }
  };

  const remove = (entry: EntryMeta) => async () => {
    if (!window.confirm(`删除条目「${entry.title || "未命名"}」？此操作不可撤销。`)) return;
    try {
      await vaultApi.deleteEntry(entry.id);
      if (selected === entry.id) setSelected(null);
      await refresh();
      flash("已删除");
    } catch (e) {
      flash(String(e));
    }
  };

  const menuItems = (entry: EntryMeta): MenuItem[] => [
    { label: "编辑", onClick: () => setEditing(entry) },
    {
      label: "复制密码",
      separatorBefore: true,
      onClick: copyKeySecret(entry),
    },
    {
      label: "复制用户名",
      disabled: !entry.username,
      onClick: copyField("用户名", entry.username),
    },
    {
      label: "复制 baseurl",
      disabled: !entry.base_url,
      onClick: copyField("baseurl", entry.base_url),
    },
    {
      label: "复制环境变量名",
      disabled: !entry.env_var,
      onClick: copyField("环境变量名", entry.env_var),
    },
    {
      label: "复制模型 id",
      disabled: !entry.model_id,
      onClick: copyField("模型 id", entry.model_id),
    },
    {
      label: "复制文档地址",
      disabled: !entry.docs_url,
      onClick: copyField("文档地址", entry.docs_url),
    },
    {
      label: "复制控制台地址",
      disabled: !entry.console_url,
      onClick: copyField("控制台地址", entry.console_url),
    },
    {
      label: "打开文档地址",
      separatorBefore: true,
      disabled: !entry.docs_url,
      onClick: open(entry.docs_url),
    },
    {
      label: "打开控制台地址",
      disabled: !entry.console_url,
      onClick: open(entry.console_url),
    },
    {
      label: `附件（${entry.attachments.length}）`,
      separatorBefore: true,
      submenuEmptyLabel: "无附件（在编辑里导入）",
      submenu: entry.attachments.map((a) => ({
        label: `${a.name} · ${formatBytes(a.size)}`,
        onClick: saveAttachment(entry, a.name),
      })),
    },
    { label: "删除", separatorBefore: true, danger: true, onClick: remove(entry) },
  ];

  const rowColumnStyle = cssVars(columnWidths);

  return (
    <>
      <div className="key-toolbar">
        <div className="search">
          <input
            placeholder="搜索条目名、用途、标签、用户名、环境变量、模型 id…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button className="btn primary" onClick={() => setEditing("new")}>
          + 新建 Key
        </button>
      </div>

      <nav className="filters key-filters">
        <button
          className={`chip ${
            projectFilter === "all" && customTagFilter === "all" && paymentFilter === "all"
              ? "active"
              : ""
          }`}
          onClick={() => {
            setProjectFilter("all");
            setCustomTagFilter("all");
            setPaymentFilter("all");
          }}
        >
          全部
          <span className="chip-count">{entries.length}</span>
        </button>

        <FilterDropdown
          label="项目"
          value={projectFilter}
          options={projectOptions}
          onChange={setProjectFilter}
        />
        <FilterDropdown
          label="自定义标签"
          value={customTagFilter}
          options={customTagOptions}
          onChange={setCustomTagFilter}
        />
        <FilterDropdown
          label="付款方式"
          value={paymentFilter}
          options={paymentOptions}
          onChange={setPaymentFilter}
        />
      </nav>

      {entries.length > 0 && <ColumnHeader widths={columnWidths} />}

      <div className="key-table-body">
        <main className="list key-list">
          {loading ? (
            <div className="empty">加载中…</div>
          ) : error ? (
            <div className="empty">
              <p className="vault-error">{error}</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="empty">
              <p>还没有 Key</p>
              <button className="btn primary" onClick={() => setEditing("new")}>
                创建第一个 Key
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <p>没有匹配的条目</p>
            </div>
          ) : (
            filtered.map((e) => (
              <KeyRow
                key={e.id}
                entry={e}
                projects={projects}
                selected={selected === e.id}
                columnStyle={rowColumnStyle}
                onSelect={() => setSelected(e.id)}
                onOpen={() => setEditing(e)}
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  setSelected(e.id);
                  setMenu({ x: ev.clientX, y: ev.clientY, entry: e });
                }}
              />
            ))
          )}
        </main>

        {entries.length > 0 && columnLinesVisible && (
          <ColumnLinesOverlay widths={columnWidths} onResize={onColumnResize} />
        )}
      </div>

      <footer className="key-statusbar">
        <span>
          {filtered.length === entries.length
            ? `${entries.length} 条`
            : `${filtered.length} / ${entries.length} 条`}
        </span>
        <span className="dot-sep">·</span>
        <span title={status.path}>库文件 {formatBytes(status.file_size)}</span>
      </footer>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.entry)}
          onClose={() => setMenu(null)}
        />
      )}

      {editing && (
        <KeyEditor
          entry={editing === "new" ? null : editing}
          projects={projects}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
            flash("已保存");
          }}
          onDeleted={async () => {
            setEditing(null);
            setSelected(null);
            await refresh();
            flash("已删除");
          }}
          onNotify={flash}
          onVaultChanged={refresh}
        />
      )}

      {toast && <div className="key-toast">{toast}</div>}
    </>
  );
}

/**
 * Translate column widths into CSS variables that `KeyRow` consumes. Each
 * column declares its own `--col-<key>` variable so a single drag can target
 * exactly one width while leaving siblings at their own widths.
 *
 * The entry column is the one exception: it always gets `minmax(width, 1fr)`
 * rather than a literal width, so it absorbs whatever space the other
 * (fixed-width, content-sized) columns don't need instead of leaving the row
 * short of the container's full width on a wide window.
 */
function cssVars(widths: Record<ColKey, number>): CSSProperties {
  // CSSProperties doesn't index custom properties; cast to the loose shape
  // we know the row's CSS reads.
  const out = {} as CSSProperties & Record<`--col-${ColKey}`, string>;
  for (const k of COL_KEYS) {
    out[`--col-${k}`] = k === "entry" ? `minmax(${widths[k]}px, 1fr)` : `${widths[k]}px`;
  }
  return out;
}

const COL_LABELS: Record<ColKey, string> = {
  entry: "标题",
  projects: "项目",
  tags: "标签",
  env: "环境变量",
  model: "模型",
  actions: "操作",
  updated: "更新时间",
};

/** Text-only header row above the list — one label per column. Resizing lives
 * in `ColumnLinesOverlay`, not here, so this row stays as short as the text
 * needs. */
function ColumnHeader({ widths }: { widths: Record<ColKey, number> }) {
  return (
    <div className="key-col-header" style={cssVars(widths)}>
      {COL_KEYS.map((k) => (
        <div key={k} className={`key-col-header-cell key-col-header-cell--${k}`}>
          <span className="key-col-label">{COL_LABELS[k]}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Column-boundary guides that run the full height of the list viewport (not
 * just a header strip), so the boundary — and the ability to drag it — stays
 * reachable no matter how far the list has scrolled. Lives as a sibling of
 * `<main>` inside a `position: relative` wrapper, outside the scrolling
 * element, so it doesn't scroll away with the rows. Only the thin line itself
 * re-enables pointer events; the rest of the overlay is click-through so row
 * selection, double-click-to-edit, and right-click still work underneath it.
 * Double-clicking a line resets just that column back to its default width.
 */
function ColumnLinesOverlay({
  widths,
  onResize,
}: {
  widths: Record<ColKey, number>;
  onResize: (key: ColKey, value: number) => void;
}) {
  const startDrag = (e: ReactMouseEvent<HTMLDivElement>, key: ColKey) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[key];
    const move = (ev: MouseEvent) => {
      onResize(key, startW + (ev.clientX - startX));
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  return (
    <div className="key-col-lines" style={cssVars(widths)} aria-hidden="true">
      {COL_KEYS.map((k, i) => (
        <div key={k} className={`key-col-lines-cell key-col-lines-cell--${k}`}>
          {i < COL_KEYS.length - 1 && (
            <div
              className="key-col-line"
              role="separator"
              aria-orientation="vertical"
              title="拖动调整列宽，双击恢复默认"
              onMouseDown={(e) => startDrag(e, k)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onResize(k, DEFAULT_COL_WIDTHS[k]);
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * A "全部" + labeled option list behind a single trigger button, used for the
 * project / custom-tag / payment-method filters. Each instance owns its own
 * open state and closes on an outside click, mirroring the picker in
 * `KeyEditor`.
 */
function FilterDropdown<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | "all";
  options: { value: T; label: string; count: number }[];
  onChange: (v: T | "all") => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const selected = value === "all" ? null : options.find((o) => o.value === value) ?? null;
  const total = options.reduce((s, o) => s + o.count, 0);

  if (options.length === 0) return null;

  return (
    <div className="filter-dropdown" ref={ref}>
      <button
        type="button"
        className={`chip filter-dropdown-trigger ${selected ? "active" : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        {selected ? selected.label : label}
        <span className="chip-count">{selected ? selected.count : total}</span>
        <span className="filter-caret">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="filter-dropdown-menu">
          <button
            type="button"
            className={`filter-dropdown-item ${value === "all" ? "active" : ""}`}
            onClick={() => {
              onChange("all");
              setOpen(false);
            }}
          >
            全部
            <span className="chip-count">{total}</span>
          </button>
          <div className="ctx-sep" />
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`filter-dropdown-item ${value === o.value ? "active" : ""}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
              <span className="chip-count">{o.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
