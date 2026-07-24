import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { Project, ProjectInput, Status, STATUS_META, emptyInput } from "../types";

export function Editor({
  project,
  onClose,
  onSave,
  onDelete,
}: {
  project: Project | null;
  onClose: () => void;
  onSave: (input: ProjectInput) => void;
  onDelete: (id: number) => void;
}) {
  const [form, setForm] = useState<ProjectInput>(
    project ? stripToInput(project) : emptyInput()
  );
  const [techInput, setTechInput] = useState("");
  const [scanning, setScanning] = useState(false);

  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const pickFolder = async () => {
    const dir = await open({ directory: true });
    if (typeof dir === "string") {
      set("folder", dir);
      setScanning(true);
      try {
        const s = await api.scan(dir);
        setForm((f) => ({
          ...f,
          folder: dir,
          name: f.name || s.suggested_name,
          repo: f.repo || s.repo,
          tech_stack: mergeTags(f.tech_stack, s.tech_stack),
        }));
      } finally {
        setScanning(false);
      }
    }
  };

  const addTag = () => {
    const t = techInput.trim();
    if (t && !form.tech_stack.includes(t)) {
      set("tech_stack", [...form.tech_stack, t]);
    }
    setTechInput("");
  };

  const removeTag = (t: string) =>
    set("tech_stack", form.tech_stack.filter((x) => x !== t));

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{project ? "编辑项目" : "新建项目"}</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="modal-body">
          <label className="field">
            <span>项目名</span>
            <input
              value={form.name}
              autoFocus
              onChange={(e) => set("name", e.target.value)}
              placeholder="my-awesome-project"
            />
          </label>

          <label className="field">
            <span>本地文件夹</span>
            <div className="folder-pick">
              <input
                value={form.folder}
                onChange={(e) => set("folder", e.target.value)}
                placeholder="选择文件夹后自动探测技术栈…"
              />
              <button className="btn" onClick={pickFolder} disabled={scanning}>
                {scanning ? "扫描中…" : "选择"}
              </button>
            </div>
          </label>

          <label className="field">
            <span>项目定位</span>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="一句话说明这个项目是做什么的"
            />
          </label>

          <div className="field">
            <span>技术栈</span>
            <div className="tags editable">
              {form.tech_stack.map((t) => (
                <span key={t} className="tag">
                  {t}
                  <button onClick={() => removeTag(t)}>×</button>
                </span>
              ))}
              <input
                className="tag-input"
                value={techInput}
                onChange={(e) => setTechInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="回车添加"
              />
            </div>
          </div>

          <div className="field-row">
            <label className="field">
              <span>状态</span>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value as Status)}
              >
                {(Object.keys(STATUS_META) as Status[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>进度 {form.progress}%</span>
              <input
                type="range"
                min={0}
                max={100}
                value={form.progress}
                onChange={(e) => set("progress", Number(e.target.value))}
              />
            </label>
          </div>

          <div className="field-row">
            <label className="field checkbox">
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={(e) => set("pinned", e.target.checked)}
              />
              <span>重点开发</span>
            </label>
            <label className="field checkbox">
              <input
                type="checkbox"
                checked={form.favorite}
                onChange={(e) => set("favorite", e.target.checked)}
              />
              <span>收藏</span>
            </label>
          </div>

          <div className="field-row">
            <label className="field checkbox">
              <input
                type="checkbox"
                checked={form.deployed}
                onChange={(e) => set("deployed", e.target.checked)}
              />
              <span>已上线</span>
            </label>
            <label className="field checkbox">
              <input
                type="checkbox"
                checked={form.open_source}
                onChange={(e) => set("open_source", e.target.checked)}
              />
              <span>已开源</span>
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>部署方式</span>
              <input
                value={form.deploy_method}
                onChange={(e) => set("deploy_method", e.target.value)}
                placeholder="Vercel / VPS / App Store…"
              />
            </label>
            <label className="field">
              <span>仓库地址</span>
              <input
                value={form.repo}
                onChange={(e) => set("repo", e.target.value)}
                placeholder="git remote"
              />
            </label>
          </div>

          <label className="field">
            <span>线上地址</span>
            <input
              value={form.url}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://…"
            />
          </label>

          <label className="field">
            <span>备注</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="待办、想法、遗留问题…"
            />
          </label>
        </div>

        <footer className="modal-foot">
          {project && (
            <button
              className="btn danger"
              onClick={() => onDelete(project.id)}
            >
              删除
            </button>
          )}
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button
            className="btn primary"
            disabled={!form.name.trim()}
            onClick={() => onSave(form)}
          >
            保存
          </button>
        </footer>
      </div>
    </div>
  );
}

function stripToInput(p: Project): ProjectInput {
  const { id, created_at, updated_at, ...rest } = p;
  void id;
  void created_at;
  void updated_at;
  return rest;
}

function mergeTags(a: string[], b: string[]): string[] {
  const out = [...a];
  for (const t of b) if (!out.includes(t)) out.push(t);
  return out;
}
