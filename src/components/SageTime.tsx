import { useEffect, useState } from "react";
import { api } from "../api";
import { Project, SageEntry, SageEntryInput, Quadrant, QUADRANT_META } from "../types";

interface Props {
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
}

type View = "record" | "quadrant";

export function SageTime({ projects, onClose, onSaved }: Props) {
  const [view, setView] = useState<View>("record");
  const [sageEntries, setSageEntries] = useState<SageEntry[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | "">("");
  const [whereStopped, setWhereStopped] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [quadrant, setQuadrant] = useState<Quadrant | "">("");
  const [saving, setSaving] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverQuad, setDragOverQuad] = useState<string | null>(null);

  const activeProjects = projects.filter((p) => p.status === "active");

  const loadEntries = async () => {
    setSageEntries(await api.sageList());
  };

  useEffect(() => {
    loadEntries();
  }, []);

  const handleSave = async () => {
    if (selectedProject === "") return;
    setSaving(true);
    try {
      const input: SageEntryInput = {
        project_id: selectedProject as number,
        where_stopped: whereStopped.trim(),
        next_steps: nextSteps.trim(),
        quadrant: quadrant !== "" ? quadrant : null,
      };
      await api.sageCreate(input);
      setSelectedProject("");
      setWhereStopped("");
      setNextSteps("");
      setQuadrant("");
      await loadEntries();
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    await api.sageDelete(id);
    await loadEntries();
    onSaved();
  };

  const handleDragStart = (e: React.DragEvent, id: number) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(id));
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverQuad(null);
  };

  const handleDragOver = (e: React.DragEvent, quadKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverQuad !== quadKey) {
      setDragOverQuad(quadKey);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const cell = e.currentTarget;
    const related = e.relatedTarget as Node | null;
    if (related && cell.contains(related)) return;
    setDragOverQuad(null);
  };

  const handleDrop = async (e: React.DragEvent, newQuadrant: Quadrant | null) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("text/plain"));
    if (!id || isNaN(id)) return;
    setDraggingId(null);
    setDragOverQuad(null);

    const entry = sageEntries.find((e) => e.id === id);
    if (!entry) return;
    if (entry.quadrant === newQuadrant) return;

    const input: SageEntryInput = {
      project_id: entry.project_id,
      where_stopped: entry.where_stopped,
      next_steps: entry.next_steps,
      quadrant: newQuadrant,
    };
    await api.sageUpdate(id, input);
    await loadEntries();
    onSaved();
  };

  const entriesByQuadrant = (q: Quadrant) =>
    sageEntries.filter((e) => e.quadrant === q);

  const unclassified = sageEntries.filter((e) => !e.quadrant);

  const projectName = (pid: number) =>
    projects.find((p) => p.id === pid)?.name ?? "已删除项目";

  const valid = selectedProject !== "";

  const renderEntry = (e: SageEntry) => (
    <div
      key={e.id}
      className={`quadrant-entry ${draggingId === e.id ? "dragging" : ""}`}
      draggable
      onDragStart={(ev) => handleDragStart(ev, e.id)}
      onDragEnd={handleDragEnd}
    >
      <div className="quadrant-entry-project">
        {projectName(e.project_id)}
      </div>
      {e.where_stopped && (
        <div className="quadrant-entry-text">
          中断: {e.where_stopped}
        </div>
      )}
      {e.next_steps && (
        <div className="quadrant-entry-text">
          下一步: {e.next_steps}
        </div>
      )}
      <button
        className="mini mini--danger quadrant-entry-del"
        onClick={() => handleDelete(e.id)}
      >
        删除
      </button>
    </div>
  );

  const renderCell = (quadKey: string, label: string, entries: SageEntry[], cellClass: string) => (
    <div
      key={quadKey}
      className={`quadrant-cell ${cellClass} ${dragOverQuad === quadKey ? "drag-over" : ""}`}
      onDragOver={(e) => handleDragOver(e, quadKey)}
      onDragLeave={(e) => handleDragLeave(e)}
      onDrop={(e) =>
        handleDrop(
          e,
          quadKey === "uncat" ? null : (quadKey as Quadrant)
        )
      }
    >
      <div className="quadrant-cell-head">{label}</div>
      {entries.length === 0 ? (
        <div className="quadrant-cell-empty">—</div>
      ) : (
        entries.map(renderEntry)
      )}
    </div>
  );

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal sage-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div className="sage-tabs">
            <button
              className={`sage-tab ${view === "record" ? "active" : ""}`}
              onClick={() => setView("record")}
            >
              🧘 贤者时刻
            </button>
            <button
              className={`sage-tab ${view === "quadrant" ? "active" : ""}`}
              onClick={() => setView("quadrant")}
            >
              📊 贤者的追求
            </button>
          </div>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </header>

        {view === "record" && (
          <>
            <div className="modal-body">
              <label className="field">
                <span>进行中的项目</span>
                {activeProjects.length === 0 ? (
                  <p className="sage-hint">暂无进行中的项目</p>
                ) : (
                  <select
                    value={selectedProject}
                    onChange={(e) =>
                      setSelectedProject(
                        e.target.value ? Number(e.target.value) : ""
                      )
                    }
                  >
                    <option value="">— 选择项目 —</option>
                    {activeProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </label>

              <label className="field">
                <span>中断位置 / 当前进度</span>
                <textarea
                  rows={3}
                  placeholder="描述目前在哪里停止的…"
                  value={whereStopped}
                  onChange={(e) => setWhereStopped(e.target.value)}
                />
              </label>

              <label className="field">
                <span>下一步要做什么</span>
                <textarea
                  rows={3}
                  placeholder="记录接下来要开始的事…"
                  value={nextSteps}
                  onChange={(e) => setNextSteps(e.target.value)}
                />
              </label>

              <label className="field">
                <span>象限归类（可选）</span>
                <div className="quadrant-picker">
                  {(["q1", "q2", "q3", "q4"] as Quadrant[]).map((q) => (
                    <button
                      key={q}
                      className={`quadrant-opt quadrant-opt--${q} ${
                        quadrant === q ? "active" : ""
                      }`}
                      onClick={() => setQuadrant(quadrant === q ? "" : q)}
                    >
                      <span className="quadrant-opt-label">
                        {QUADRANT_META[q].label}
                      </span>
                      <span className="quadrant-opt-desc">
                        {QUADRANT_META[q].desc}
                      </span>
                    </button>
                  ))}
                </div>
              </label>
            </div>
            <footer className="modal-foot">
              <div className="spacer" />
              <button className="btn" onClick={onClose}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={!valid || saving}
                onClick={handleSave}
              >
                {saving ? "保存中…" : "记录"}
              </button>
            </footer>
          </>
        )}

        {view === "quadrant" && (
          <div className="modal-body quadrant-body">
            {sageEntries.length === 0 ? (
              <p className="sage-empty">暂无贤者记录</p>
            ) : (
              <div className="quadrant-grid">
                {(["q1", "q2", "q3", "q4"] as Quadrant[]).map((q) =>
                  renderCell(q, QUADRANT_META[q].label, entriesByQuadrant(q), `quadrant-cell--${q}`)
                )}
                {unclassified.length > 0 &&
                  renderCell("uncat", "未分类", unclassified, "quadrant-cell--uncat")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
