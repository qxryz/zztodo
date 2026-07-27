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

  const entriesByQuadrant = (q: Quadrant) =>
    sageEntries.filter((e) => e.quadrant === q);

  const projectName = (pid: number) =>
    projects.find((p) => p.id === pid)?.name ?? "已删除项目";

  const valid = selectedProject !== "";

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal sage-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div className="sage-tabs">
            <button
              className={`sage-tab ${view === "record" ? "active" : ""}`}
              onClick={() => setView("record")}
            >
              🧘 记录中断
            </button>
            <button
              className={`sage-tab ${view === "quadrant" ? "active" : ""}`}
              onClick={() => setView("quadrant")}
            >
              📊 四象限
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
              <p className="sage-empty">暂无中断记录</p>
            ) : (
              <div className="quadrant-grid">
                {(["q1", "q2", "q3", "q4"] as Quadrant[]).map((q) => {
                  const entries = entriesByQuadrant(q);
                  return (
                    <div key={q} className={`quadrant-cell quadrant-cell--${q}`}>
                      <div className="quadrant-cell-head">
                        {QUADRANT_META[q].label}
                      </div>
                      {entries.length === 0 ? (
                        <div className="quadrant-cell-empty">—</div>
                      ) : (
                        entries.map((e) => (
                          <div key={e.id} className="quadrant-entry">
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
                        ))
                      )}
                    </div>
                  );
                })}
                {/* Unclassified entries */}
                {sageEntries.filter((e) => !e.quadrant).length > 0 && (
                  <div className="quadrant-cell quadrant-cell--uncat">
                    <div className="quadrant-cell-head">未分类</div>
                    {sageEntries
                      .filter((e) => !e.quadrant)
                      .map((e) => (
                        <div key={e.id} className="quadrant-entry">
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
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
