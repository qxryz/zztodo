import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Project } from "../../types";
import { vaultApi } from "../../vault/api";
import { copySecret, copyText, SECRET_TTL_SECONDS } from "../../vault/clipboard";
import { formatBytes, type EntryMeta, type VaultStatus } from "../../vault/types";
import { KeyRow } from "./KeyRow";
import { ContextMenu, type MenuItem } from "./ContextMenu";

interface MenuAnchor {
  x: number;
  y: number;
  entry: EntryMeta;
}

export function KeyList({
  status,
  projects,
  onStatus,
}: {
  status: VaultStatus;
  projects: Project[];
  onStatus: (s: VaultStatus) => void;
}) {
  const [entries, setEntries] = useState<EntryMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<number | "all">("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
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

  const allTags = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => e.tags.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (projectFilter !== "all" && !e.project_ids.includes(projectFilter)) return false;
      if (tagFilter && !e.tags.includes(tagFilter)) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.purpose.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q) ||
        e.env_var.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [entries, query, projectFilter, tagFilter]);

  // Only projects that actually have keys are worth offering as filters.
  const usedProjects = useMemo(() => {
    const ids = new Set(entries.flatMap((e) => e.project_ids));
    return projects.filter((p) => ids.has(p.id));
  }, [entries, projects]);

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
    { label: "编辑", onClick: () => setSelected(entry.id) },
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

  return (
    <>
      <div className="key-toolbar">
        <div className="search">
          <input
            placeholder="搜索条目名、用途、标签、用户名、环境变量…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <nav className="filters key-filters">
        <button
          className={`chip ${projectFilter === "all" && !tagFilter ? "active" : ""}`}
          onClick={() => {
            setProjectFilter("all");
            setTagFilter(null);
          }}
        >
          全部
          <span className="chip-count">{entries.length}</span>
        </button>

        {usedProjects.map((p) => (
          <button
            key={p.id}
            className={`chip ${projectFilter === p.id ? "active" : ""}`}
            onClick={() => setProjectFilter(projectFilter === p.id ? "all" : p.id)}
          >
            {p.name}
            <span className="chip-count">
              {entries.filter((e) => e.project_ids.includes(p.id)).length}
            </span>
          </button>
        ))}

        {allTags.map((t) => (
          <button
            key={t}
            className={`chip chip--tag ${tagFilter === t ? "active" : ""}`}
            onClick={() => setTagFilter(tagFilter === t ? null : t)}
          >
            #{t}
            <span className="chip-count">{entries.filter((e) => e.tags.includes(t)).length}</span>
          </button>
        ))}
      </nav>

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
              onSelect={() => setSelected(e.id)}
              onOpen={() => setSelected(e.id)}
              onContextMenu={(ev) => {
                ev.preventDefault();
                setSelected(e.id);
                setMenu({ x: ev.clientX, y: ev.clientY, entry: e });
              }}
            />
          ))
        )}
      </main>

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

      {toast && <div className="key-toast">{toast}</div>}
    </>
  );
}
