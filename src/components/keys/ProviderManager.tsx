import { useState } from "react";
import { vaultApi } from "../../vault/api";
import { BUILTIN_PROVIDERS, type ProviderTemplate } from "../../vault/types";

const EMPTY = { name: "", base_url: "", docs_url: "", console_url: "" };

/** Second-level modal: manage user provider templates. Builtins are read-only. */
export function ProviderManager({
  custom,
  onChange,
  onClose,
}: {
  custom: ProviderTemplate[];
  onChange: (list: ProviderTemplate[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const set = (k: keyof typeof EMPTY, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const reset = () => {
    setDraft({ ...EMPTY });
    setEditingId(null);
  };

  const submit = async () => {
    if (!draft.name.trim()) return;
    setError("");
    try {
      onChange(await vaultApi.saveProvider({ id: editingId, ...draft }));
      reset();
    } catch (e) {
      setError(String(e));
    }
  };

  const edit = (p: ProviderTemplate) => {
    setEditingId(p.id);
    setDraft({
      name: p.name,
      base_url: p.base_url,
      docs_url: p.docs_url,
      console_url: p.console_url,
    });
  };

  const remove = async (id: number) => {
    setError("");
    try {
      onChange(await vaultApi.deleteProvider(id));
      if (editingId === id) reset();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="overlay overlay--stacked" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>管理供应商模板</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="modal-body">
          <div className="field">
            <span>{editingId === null ? "新增模板" : "编辑模板"}</span>
            <div className="prov-form">
              <input
                placeholder="名称，如 我的中转站"
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
              />
              <input
                placeholder="baseurl，如 https://api.example.com/v1"
                value={draft.base_url}
                onChange={(e) => set("base_url", e.target.value)}
              />
              <input
                placeholder="文档地址（选填）"
                value={draft.docs_url}
                onChange={(e) => set("docs_url", e.target.value)}
              />
              <input
                placeholder="控制台地址（选填）"
                value={draft.console_url}
                onChange={(e) => set("console_url", e.target.value)}
              />
              <div className="prov-form-actions">
                {editingId !== null && (
                  <button className="btn" onClick={reset}>
                    取消编辑
                  </button>
                )}
                <button className="btn primary" disabled={!draft.name.trim()} onClick={submit}>
                  {editingId === null ? "添加" : "保存"}
                </button>
              </div>
            </div>
          </div>

          {error && <p className="vault-error">{error}</p>}

          <div className="field">
            <span>我的模板（{custom.length}）</span>
            {custom.length === 0 ? (
              <p className="prov-hint">还没有自定义模板</p>
            ) : (
              <div className="prov-list">
                {custom.map((p) => (
                  <div key={p.id} className="prov-item">
                    <div className="prov-item-main">
                      <span className="prov-name">{p.name}</span>
                      <span className="prov-url">{p.base_url}</span>
                    </div>
                    <button className="mini" onClick={() => edit(p)}>
                      编辑
                    </button>
                    <button className="mini mini--danger" onClick={() => remove(p.id)}>
                      删除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <span>内置模板（{BUILTIN_PROVIDERS.length}，只读）</span>
            <div className="prov-list">
              {BUILTIN_PROVIDERS.map((p) => (
                <div key={p.name} className="prov-item prov-item--builtin">
                  <div className="prov-item-main">
                    <span className="prov-name">{p.name}</span>
                    <span className="prov-url">{p.base_url}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <footer className="modal-foot">
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            完成
          </button>
        </footer>
      </div>
    </div>
  );
}
