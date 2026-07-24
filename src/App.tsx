import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { Project, ProjectInput, Status, STATUS_META, TAG_META, TagKey } from "./types";
import { useTheme } from "./useTheme";
import { useFontScale } from "./useFontScale";
import { useLayout } from "./useLayout";
import { useTagColors } from "./useTagColors";
import { ProjectCard } from "./components/ProjectCard";
import { ProjectRow } from "./components/ProjectRow";
import { LayoutSwitch } from "./components/LayoutSwitch";
import { Editor } from "./components/Editor";
import { Settings } from "./components/Settings";

type Filter = "all" | Status | "pinned" | "favorite";

export default function App() {
  const { theme, setTheme } = useTheme();
  const { fontScale, setFontScale } = useFontScale();
  const { layout, setLayout } = useLayout();
  const tagColors = useTagColors();
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setProjects(await api.list());
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (filter === "pinned" && !p.pinned) return false;
      else if (filter === "favorite" && !p.favorite) return false;
      else if (filter !== "all" && filter !== "pinned" && filter !== "favorite" && p.status !== filter)
        return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tech_stack.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [projects, query, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: projects.length, pinned: 0, favorite: 0 };
    for (const p of projects) {
      c[p.status] = (c[p.status] || 0) + 1;
      if (p.pinned) c.pinned++;
      if (p.favorite) c.favorite++;
    }
    return c;
  }, [projects]);

  const save = async (input: ProjectInput) => {
    if (editing && editing !== "new") await api.update(editing.id, input);
    else await api.create(input);
    setEditing(null);
    refresh();
  };

  const remove = async (id: number) => {
    await api.remove(id);
    setEditing(null);
    refresh();
  };

  return (
    <div className="app">
      <header className="topbar" data-tauri-drag-region>
        <div className="brand">
          <span className="logo">zz</span>
          <span className="brand-name">todo</span>
        </div>
        <div className="search">
          <input
            placeholder="搜索项目、技术栈…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="top-actions">
          <LayoutSwitch layout={layout} onChange={setLayout} />
          <button
            className="icon-btn"
            title="设置"
            onClick={() => setSettingsOpen(true)}
          >
            ⚙
          </button>
          <button className="btn primary" onClick={() => setEditing("new")}>
            + 新建项目
          </button>
        </div>
      </header>

      <nav className="filters">
        <FilterChip
          label="全部"
          active={filter === "all"}
          count={counts.all || 0}
          onClick={() => setFilter("all")}
        />
        {(Object.keys(STATUS_META) as Status[]).map((s) => (
          <FilterChip
            key={s}
            label={STATUS_META[s].label}
            color={STATUS_META[s].color}
            active={filter === s}
            count={counts[s] || 0}
            onClick={() => setFilter(s)}
          />
        ))}
        {(Object.keys(TAG_META) as TagKey[]).map((k) => (
          <FilterChip
            key={k}
            label={TAG_META[k].label}
            color={tagColors.colors[k]}
            active={filter === k}
            count={counts[k] || 0}
            onClick={() => setFilter(k)}
          />
        ))}
      </nav>

      <main className={layout === "grid" ? "grid" : "list"}>
        {loading ? (
          <div className="empty">加载中…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <p>还没有项目</p>
            <button className="btn primary" onClick={() => setEditing("new")}>
              创建第一个项目
            </button>
          </div>
        ) : layout === "grid" ? (
          filtered.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              tagColors={tagColors.colors}
              onOpen={() => setEditing(p)}
            />
          ))
        ) : (
          filtered.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              tagColors={tagColors.colors}
              onOpen={() => setEditing(p)}
            />
          ))
        )}
      </main>

      {editing && (
        <Editor
          project={editing === "new" ? null : editing}
          tagColors={tagColors.colors}
          onClose={() => setEditing(null)}
          onSave={save}
          onDelete={remove}
        />
      )}

      {settingsOpen && (
        <Settings
          theme={theme}
          onThemeChange={setTheme}
          fontScale={fontScale}
          onFontScaleChange={setFontScale}
          tagColors={tagColors}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  color,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button className={`chip ${active ? "active" : ""}`} onClick={onClick}>
      {color && <span className="dot" style={{ background: color }} />}
      {label}
      <span className="chip-count">{count}</span>
    </button>
  );
}
