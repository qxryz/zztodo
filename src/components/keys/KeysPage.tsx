import { useState } from "react";
import { vaultApi } from "../../vault/api";
import { MASTER_PASSWORD_WARNING, formatBytes, type VaultStatus } from "../../vault/types";

export function KeysPage({
  status,
  onStatus,
}: {
  status: VaultStatus | null;
  onStatus: (s: VaultStatus) => void;
}) {
  if (!status) return <div className="empty">加载中…</div>;
  if (status.state === "uninitialized") return <SetupView onCreated={onStatus} />;
  if (status.state === "locked") return <LockView status={status} onUnlocked={onStatus} />;
  return <div className="empty">库已解锁（列表开发中）</div>;
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
      </div>
    </div>
  );
}
