import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import { Project, SageEntry, SageEntryInput, Quadrant, QUADRANT_META } from "../types";

const QUADRANTS: Quadrant[] = ["q1", "q2", "q3", "q4"];

/** Grid cells are keyed by quadrant, plus "uncat" for the unclassified strip. */
type CellKey = Quadrant | "uncat";

const cellToQuadrant = (key: CellKey): Quadrant | null =>
  key === "uncat" ? null : key;

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

  /**
   * Quadrant drag uses pointer events, not HTML5 drag-and-drop: the Tauri
   * webview owns native drag, so `drop` never fires reliably inside it. Same
   * approach as the sticky-marker reorder in Settings.
   *
   * A cell only counts as the drop target while the pointer is inside its
   * rect, and the move only commits on pointerup when the quadrant changed.
   */
  const cellRefs = useRef<Partial<Record<CellKey, HTMLDivElement | null>>>({});
  const drag = useRef<{
    id: number;
    from: Quadrant | null;
    offX: number;
    offY: number;
    startX: number;
    startY: number;
    active: boolean;
    over: CellKey | null;
  } | null>(null);
  /**
   * A drag that ends on the backdrop would otherwise fire the overlay's click
   * and close the modal. pointerup clears the drag state before that click
   * arrives, so the veto has to live in a ref that the click consumes.
   */
  const swallowClose = useRef(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overCell, setOverCell] = useState<CellKey | null>(null);
  const [float, setFloat] = useState<{ x: number; y: number; entry: SageEntry } | null>(
    null,
  );

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

  /** Which cell contains this point, if any. */
  const cellAt = (x: number, y: number): CellKey | null => {
    for (const key of Object.keys(cellRefs.current) as CellKey[]) {
      const r = cellRefs.current[key]?.getBoundingClientRect();
      if (!r) continue;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return key;
    }
    return null;
  };

  const moveEntry = async (id: number, to: Quadrant | null) => {
    const entry = sageEntries.find((e) => e.id === id);
    if (!entry || entry.quadrant === to) return;
    // Optimistic: the card lands where it was dropped, then we persist.
    setSageEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, quadrant: to } : e)),
    );
    try {
      await api.sageUpdate(id, {
        project_id: entry.project_id,
        where_stopped: entry.where_stopped,
        next_steps: entry.next_steps,
        quadrant: to,
      });
      onSaved();
    } finally {
      await loadEntries();
    }
  };

  const onEntryPointerDown = (
    ev: ReactPointerEvent<HTMLDivElement>,
    entry: SageEntry,
  ) => {
    if (ev.button !== 0) return;
    // Let the delete button and text selection behave normally.
    if ((ev.target as HTMLElement).closest("button")) return;
    const r = ev.currentTarget.getBoundingClientRect();
    drag.current = {
      id: entry.id,
      from: entry.quadrant,
      offX: ev.clientX - r.left,
      offY: ev.clientY - r.top,
      startX: ev.clientX,
      startY: ev.clientY,
      active: false,
      over: null,
    };

    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.active) {
        // 4px threshold keeps plain clicks from becoming drags.
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
        d.active = true;
        setDragId(d.id);
      }
      const over = cellAt(e.clientX, e.clientY);
      if (over !== d.over) {
        d.over = over;
        setOverCell(over);
      }
      setFloat({ x: e.clientX - d.offX, y: e.clientY - d.offY, entry });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const d = drag.current;
      drag.current = null;
      setDragId(null);
      setOverCell(null);
      setFloat(null);
      if (d?.active) swallowClose.current = true;
      if (d?.active && d.over) void moveEntry(d.id, cellToQuadrant(d.over));
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
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
      className={`quadrant-entry ${dragId === e.id ? "is-src" : ""}`}
      onPointerDown={(ev) => onEntryPointerDown(ev, e)}
      title="按住拖到其他象限"
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

  const renderCell = (
    key: CellKey,
    label: string,
    entries: SageEntry[],
    cellClass: string,
    desc?: string,
  ) => {
    const isTarget = overCell === key;
    // Dropping a card back into its own quadrant is a no-op, so don't tease it.
    const inert = isTarget && drag.current?.from === cellToQuadrant(key);
    return (
      <div
        key={key}
        ref={(el) => {
          cellRefs.current[key] = el;
        }}
        className={`quadrant-cell ${cellClass} ${
          isTarget ? (inert ? "is-origin" : "is-target") : ""
        }`}
      >
        <div className="quadrant-cell-head">
          <span className="quadrant-cell-label">{label}</span>
          {desc && <span className="quadrant-cell-desc">{desc}</span>}
          {entries.length > 0 && (
            <span className="quadrant-cell-count">{entries.length}</span>
          )}
        </div>
        {entries.length === 0 ? (
          <div className="quadrant-cell-empty">
            {dragId !== null ? "拖到这里" : "—"}
          </div>
        ) : (
          entries.map(renderEntry)
        )}
      </div>
    );
  };

  return (
    <div
      className="overlay"
      onClick={() => {
        if (swallowClose.current) {
          swallowClose.current = false;
          return;
        }
        onClose();
      }}
    >
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
              <>
                <div className={`quadrant-grid ${dragId !== null ? "is-dragging" : ""}`}>
                  {QUADRANTS.map((q) =>
                    renderCell(
                      q,
                      QUADRANT_META[q].label,
                      entriesByQuadrant(q),
                      `quadrant-cell--${q}`,
                      QUADRANT_META[q].desc,
                    ),
                  )}
                  {/* Always rendered while dragging, so a card can be sent back
                      to unclassified even when the strip is empty. */}
                  {(unclassified.length > 0 || dragId !== null) &&
                    renderCell(
                      "uncat",
                      "未分类",
                      unclassified,
                      "quadrant-cell--uncat",
                    )}
                </div>
                <p className="sage-hint quadrant-tip">
                  按住卡片拖到其他象限即可重新归类
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {float &&
        createPortal(
          <div
            className="quadrant-entry quadrant-entry--float"
            style={{ left: float.x, top: float.y }}
            aria-hidden
          >
            <div className="quadrant-entry-project">
              {projectName(float.entry.project_id)}
            </div>
            {float.entry.where_stopped && (
              <div className="quadrant-entry-text">
                中断: {float.entry.where_stopped}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
