import { useState } from "react";
import type { Project } from "../../types";
import { vaultApi } from "../../vault/api";
import { MASTER_PASSWORD_WARNING, formatBytes, type VaultStatus } from "../../vault/types";
import type { ColKey } from "../../vault/useKeyColumnWidths";
import { KeyList } from "./KeyList";

const DESTROY_PHRASE = "注销库";

export function KeysPage({
  status,
  projects,
  onStatus,
  columnWidths,
  onColumnResize,
}: {
  status: VaultStatus | null;
  projects: Project[];
  onStatus: (s: VaultStatus) => void;
  columnWidths: Record<ColKey, number>;
  onColumnResize: (key: ColKey, value: number) => void;
}) {
  if (!status) return <div className="empty">加载中…</div>;
  if (status.state === "uninitialized") return <SetupView onCreated={onStatus} />;
  if (status.state === "locked") return <LockView status={status} onUnlocked={onStatus} />;
  return (
    <KeyList
      status={status}
      projects={projects}
      onStatus={onStatus}
      columnWidths={columnWidths}
      onColumnResize={onColumnResize}
    />
  );
}

function SetupView({ onCreated }: { onCreated: (s: VaultStatus) => void }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && pw !== confirm;
  const canSubmit = pw.length > 0 && pw === confirm && !busy;

  const create = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      onCreated(await vaultApi.create(pw));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vault-gate">
      <div className="vault-card">
        <h2>创建 Key 库主密码</h2>
        <p className="vault-warning">{MASTER_PASSWORD_WARNING}</p>

        <label className="field">
          <span>主密码</span>
          <input
            type="password"
            value={pw}
            autoFocus
            onChange={(e) => setPw(e.target.value)}
            placeholder="设置一个强密码"
          />
        </label>

        <label className="field">
          <span>确认主密码</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="再输入一次"
          />
        </label>

        {mismatch && <p className="vault-error">两次输入不一致</p>}
        {error && <p className="vault-error">{error}</p>}

        <button className="btn primary vault-submit" disabled={!canSubmit} onClick={create}>
          {busy ? "创建中…" : "创建库"}
        </button>
      </div>
    </div>
  );
}

function LockView({
  status,
  onUnlocked,
}: {
  status: VaultStatus;
  onUnlocked: (s: VaultStatus) => void;
}) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const unlock = async () => {
    if (!pw || busy) return;
    setBusy(true);
    setError("");
    try {
      onUnlocked(await vaultApi.unlock(pw));
      setPw("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vault-gate">
      <div className="vault-card">
        <h2>🔒 Key 库已锁定</h2>

        <label className="field">
          <span>主密码</span>
          <input
            type="password"
            value={pw}
            autoFocus
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && unlock()}
            placeholder="输入主密码解锁"
          />
        </label>

        {error && <p className="vault-error">{error}</p>}

        <button className="btn primary vault-submit" disabled={!pw || busy} onClick={unlock}>
          {busy ? "解锁中…" : "解锁"}
        </button>

        <p className="vault-meta">
          库文件：{formatBytes(status.file_size)}
          <br />
          <span className="vault-path" title={status.path}>
            {status.path}
          </span>
        </p>

        <DestroyPanel status={status} onDestroyed={onUnlocked} />
      </div>
    </div>
  );
}

// The escape hatch for a forgotten master password. Deliberately two-step and
// gated on typing the phrase: there is no undo and no backup worth keeping,
// since the ciphertext is useless without the password.
function DestroyPanel({
  status,
  onDestroyed,
}: {
  status: VaultStatus;
  onDestroyed: (s: VaultStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button className="link-btn vault-forgot" onClick={() => setOpen(true)}>
        忘记主密码？
      </button>
    );
  }

  const confirmed = typed.trim() === DESTROY_PHRASE;

  const destroy = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    setError("");
    try {
      onDestroyed(await vaultApi.destroy());
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <div className="vault-danger">
      <p className="vault-danger-title">⚠️ 注销库</p>
      <p>
        主密码无法找回。注销将<strong>永久删除库文件</strong>，其中的全部条目、密码和附件都会丢失，
        <strong>无法撤销、无法恢复</strong>。
      </p>
      <p className="vault-meta">
        将删除：
        <span className="vault-path" title={status.path}>
          {status.path}
        </span>
        （{formatBytes(status.file_size)}）
      </p>

      <label className="field">
        <span>
          输入 <code>{DESTROY_PHRASE}</code> 以确认
        </span>
        <input
          value={typed}
          autoFocus
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && destroy()}
          placeholder={DESTROY_PHRASE}
        />
      </label>

      {error && <p className="vault-error">{error}</p>}

      <div className="vault-danger-actions">
        <button
          className="btn"
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError("");
          }}
        >
          取消
        </button>
        <button className="btn danger" disabled={!confirmed || busy} onClick={destroy}>
          {busy ? "注销中…" : "永久删除库"}
        </button>
      </div>
    </div>
  );
}
