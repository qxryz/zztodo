import { useEffect, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Project } from "../../types";
import { vaultApi } from "../../vault/api";
import { copySecret, SECRET_TTL_SECONDS } from "../../vault/clipboard";
import {
  MAX_ATTACHMENT_SIZE,
  emptyEntryInput,
  entryToInput,
  formatBytes,
  providerOptions,
  type AttachmentMeta,
  type EntryInput,
  type EntryMeta,
  type ProviderOption,
  type ProviderTemplate,
} from "../../vault/types";
import { ProviderManager } from "./ProviderManager";

export function KeyEditor({
  entry,
  projects,
  onClose,
  onSaved,
  onDeleted,
  onNotify,
  onVaultChanged,
}: {
  /** null = creating a new entry. */
  entry: EntryMeta | null;
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onNotify: (msg: string) => void;
  /** Attachment edits write to the vault immediately, outside the save button. */
  onVaultChanged: () => void;
}) {
  const [form, setForm] = useState<EntryInput>(() =>
    entry ? entryToInput(entry) : emptyEntryInput()
  );
  const [tagInput, setTagInput] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [secretLoaded, setSecretLoaded] = useState(!entry);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>(entry?.attachments ?? []);
  const [customProviders, setCustomProviders] = useState<ProviderTemplate[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof EntryInput>(k: K, v: EntryInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    vaultApi.listProviders().then(setCustomProviders).catch(() => {});
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    const close = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [pickerOpen]);

  /** Existing entries keep their secret server-side until the user reveals it. */
  const revealSecret = async () => {
    if (!entry || secretLoaded) {
      setShowSecret((s) => !s);
      return;
    }
    try {
      const secret = await vaultApi.getSecret(entry.id);
      setForm((f) => ({ ...f, secret }));
      setSecretLoaded(true);
      setShowSecret(true);
    } catch (e) {
      setError(String(e));
    }
  };

  const copyCurrentSecret = async () => {
    try {
      const secret = form.secret ?? (entry ? await vaultApi.getSecret(entry.id) : "");
      if (!secret) {
        onNotify("该条目没有密码");
        return;
      }
      await copySecret(secret);
      onNotify(`已复制密码，${SECRET_TTL_SECONDS} 秒后自动清除剪贴板`);
    } catch (e) {
      setError(String(e));
    }
  };

  const applyProvider = (p: ProviderOption) => {
    setForm((f) => ({
      ...f,
      base_url: p.base_url,
      docs_url: p.docs_url || f.docs_url,
      console_url: p.console_url || f.console_url,
      title: f.title || p.name,
    }));
    setPickerOpen(false);
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) set("tags", [...form.tags, t]);
    setTagInput("");
  };

  const toggleProject = (id: number) =>
    set(
      "project_ids",
      form.project_ids.includes(id)
        ? form.project_ids.filter((x) => x !== id)
        : [...form.project_ids, id]
    );

  const importAttachment = async () => {
    if (!entry) return;
    try {
      const picked = await open({ multiple: false });
      if (typeof picked !== "string") return;
      setAttachments(await vaultApi.addAttachment(entry.id, picked));
      onVaultChanged();
      onNotify("附件已导入");
    } catch (e) {
      setError(String(e));
    }
  };

  const exportAttachment = async (name: string) => {
    if (!entry) return;
    try {
      const dest = await save({ defaultPath: name });
      if (typeof dest === "string") {
        await vaultApi.saveAttachmentTo(entry.id, name, dest);
        onNotify(`已另存 ${name}`);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const removeAttachment = async (name: string) => {
    if (!entry) return;
    try {
      setAttachments(await vaultApi.removeAttachment(entry.id, name));
      onVaultChanged();
    } catch (e) {
      setError(String(e));
    }
  };

  const submit = async () => {
    if (!form.title.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await vaultApi.saveEntry(form);
      onSaved();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!entry) return;
    if (!window.confirm(`删除条目「${entry.title || "未命名"}」？此操作不可撤销。`)) return;
    try {
      await vaultApi.deleteEntry(entry.id);
      onDeleted();
    } catch (e) {
      setError(String(e));
    }
  };

  const options = providerOptions(customProviders);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal key-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{entry ? "编辑 Key" : "新建 Key"}</h2>
          <div className="modal-head-actions" ref={pickerRef}>
            <button className="btn" onClick={() => setPickerOpen((o) => !o)}>
              ＋ 从供应商填入
            </button>
            {pickerOpen && (
              <div className="prov-picker">
                {options.map((p) => (
                  <button
                    key={`${p.builtin ? "b" : "c"}-${p.name}`}
                    className="prov-picker-item"
                    onClick={() => applyProvider(p)}
                  >
                    <span className="prov-name">{p.name}</span>
                    <span className="prov-url">{p.base_url}</span>
                    {!p.builtin && <span className="prov-mine">自定义</span>}
                  </button>
                ))}
                <div className="ctx-sep" />
                <button
                  className="prov-picker-item prov-picker-manage"
                  onClick={() => {
                    setPickerOpen(false);
                    setManagerOpen(true);
                  }}
                >
                  管理模板…
                </button>
              </div>
            )}
            <button className="icon-btn" onClick={onClose}>
              ✕
            </button>
          </div>
        </header>

        <div className="modal-body">
          <label className="field">
            <span>条目名</span>
            <input
              value={form.title}
              autoFocus
              onChange={(e) => set("title", e.target.value)}
              placeholder="如 OpenAI 主力 key"
            />
          </label>

          <div className="field">
            <span>所属项目（可多选，留空为通用）</span>
            {projects.length === 0 ? (
              <p className="prov-hint">还没有项目</p>
            ) : (
              <div className="proj-select">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`chip ${form.project_ids.includes(p.id) ? "active" : ""}`}
                    onClick={() => toggleProject(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className="field">
            <span>密码（API key）</span>
            <div className="secret-row">
              <input
                type={showSecret ? "text" : "password"}
                value={
                  form.secret === null ? "" : form.secret
                }
                placeholder={
                  entry && !secretLoaded ? "已保存（点 👁 查看或直接输入以替换）" : "粘贴 key"
                }
                onChange={(e) => {
                  set("secret", e.target.value);
                  setSecretLoaded(true);
                }}
              />
              <button className="mini" type="button" title="显示 / 隐藏" onClick={revealSecret}>
                {showSecret ? "🙈" : "👁"}
              </button>
              <button className="mini" type="button" title="复制密码" onClick={copyCurrentSecret}>
                📋
              </button>
            </div>
          </label>

          <label className="field">
            <span>baseurl</span>
            <input
              value={form.base_url}
              onChange={(e) => set("base_url", e.target.value)}
              placeholder="https://api.example.com/v1"
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>文档地址</span>
              <input
                value={form.docs_url}
                onChange={(e) => set("docs_url", e.target.value)}
                placeholder="选填"
              />
            </label>
            <label className="field">
              <span>官方控制台地址</span>
              <input
                value={form.console_url}
                onChange={(e) => set("console_url", e.target.value)}
                placeholder="选填"
              />
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>key 用户名</span>
              <input
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
                placeholder="账号 / 邮箱"
              />
            </label>
            <label className="field">
              <span>环境变量名</span>
              <input
                value={form.env_var}
                onChange={(e) => set("env_var", e.target.value)}
                placeholder="OPENAI_API_KEY"
              />
            </label>
          </div>

          <label className="field">
            <span>用途</span>
            <input
              value={form.purpose}
              onChange={(e) => set("purpose", e.target.value)}
              placeholder="这个 key 用来做什么"
            />
          </label>

          <label className="field">
            <span>已用</span>
            <textarea
              rows={2}
              value={form.used_in}
              onChange={(e) => set("used_in", e.target.value)}
              placeholder="这个 key 已经用在哪些地方"
            />
          </label>

          <div className="field">
            <span>标签</span>
            <div className="tags editable">
              {form.tags.map((t) => (
                <span key={t} className="tag">
                  {t}
                  <button onClick={() => set("tags", form.tags.filter((x) => x !== t))}>×</button>
                </span>
              ))}
              <input
                className="tag-input"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
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

          <label className="field">
            <span>备注</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="额度、有效期、注意事项…"
            />
          </label>

          <div className="field">
            <span>附件（单个 ≤ {formatBytes(MAX_ATTACHMENT_SIZE)}）</span>
            {!entry ? (
              <p className="prov-hint">保存后可添加附件</p>
            ) : (
              <div className="attach-box">
                {attachments.length === 0 ? (
                  <p className="prov-hint">还没有附件</p>
                ) : (
                  attachments.map((a) => (
                    <div key={a.name} className="attach-item">
                      <span className="attach-name" title={a.name}>
                        📎 {a.name}
                      </span>
                      <span className="attach-size">{formatBytes(a.size)}</span>
                      <button className="mini" onClick={() => exportAttachment(a.name)}>
                        另存
                      </button>
                      <button className="mini mini--danger" onClick={() => removeAttachment(a.name)}>
                        删除
                      </button>
                    </div>
                  ))
                )}
                <button className="btn attach-add" onClick={importAttachment}>
                  ＋ 导入附件
                </button>
              </div>
            )}
          </div>

          {error && <p className="vault-error">{error}</p>}
        </div>

        <footer className="modal-foot">
          {entry && (
            <button className="btn danger" onClick={remove}>
              删除
            </button>
          )}
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" disabled={!form.title.trim() || busy} onClick={submit}>
            {busy ? "保存中…" : "保存"}
          </button>
        </footer>
      </div>

      {managerOpen && (
        <ProviderManager
          custom={customProviders}
          onChange={setCustomProviders}
          onClose={() => setManagerOpen(false)}
        />
      )}
    </div>
  );
}
