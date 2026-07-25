import { useEffect, useMemo, useState } from "react";
import type { Project } from "../../types";
import { vaultApi } from "../../vault/api";
import { formatBytes, type EntryMeta, type VaultStatus } from "../../vault/types";
import { KeyRow } from "./KeyRow";

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
    </>
  );
}
