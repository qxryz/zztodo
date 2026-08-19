import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { getVersion } from "@tauri-apps/api/app";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { openUrl } from "@tauri-apps/plugin-opener";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { api } from "../api";
import {
  FontScale,
  Project,
  TAG_META,
  THEME_META,
  TagKey,
  Theme,
} from "../types";
import type { useTagColors } from "../useTagColors";
import {
  MARKER_CLICK_MODES,
  MARKER_COLOR_COUNT,
  type StickyMarker,
} from "../useStickyMarker";
import {
  defaultTrayConfig,
  emptyDraft,
  TRAY_EXTRA_META,
  type DraftKey,
  type TrayConfig,
  type TrayExtra,
} from "../trayTypes";
import { vaultApi } from "../vault/api";
import { AUTOLOCK_OPTIONS, type useAutoLock } from "../vault/useAutoLock";
import { platformCopy } from "../platform";

const TAG_KEYS = Object.keys(TAG_META) as TagKey[];
const THEME_KEYS = Object.keys(THEME_META) as Theme[];

const FONT_OPTIONS: { value: FontScale; label: string }[] = [
  { value: "sm", label: "小" },
  { value: "md", label: "中" },
  { value: "lg", label: "大" },
];

type Section =
  | "general"
  | "appearance"
  | "tray"
  | "vault"
  | "marker"
  | "colors"
  | "about";

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: "general", label: "通用", icon: "⚙️" },
  { key: "appearance", label: "外观", icon: "🎨" },
  { key: "tray", label: platformCopy.tray, icon: "📌" },
  { key: "vault", label: "Key 库", icon: "🔑" },
  { key: "marker", label: "粘性标记", icon: "🏷" },
  { key: "colors", label: "配色", icon: "🌈" },
  { key: "about", label: "关于", icon: "ℹ️" },
];

type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "latest" }
  | { kind: "available"; version: string; update: Update }
  | { kind: "downloading"; progress: number }
  | { kind: "ready" }
  | { kind: "error" };

export function Settings({
  theme,
  onThemeChange,
  fontScale,
  onFontScaleChange,
  tagColors,
  autoLock,
  onResetKeyColumns,
  keyColumnLinesVisible,
  onToggleKeyColumnLines,
  marker,
  vaultUnlocked,
  onEntriesReset,
  projects,
  onClose,
}: {
  theme: Theme;
  onThemeChange: (t: Theme) => void;
  fontScale: FontScale;
  onFontScaleChange: (f: FontScale) => void;
  tagColors: ReturnType<typeof useTagColors>;
  autoLock: ReturnType<typeof useAutoLock>;
  onResetKeyColumns: () => void;
  keyColumnLinesVisible: boolean;
  onToggleKeyColumnLines: () => void;
  marker: StickyMarker;
  /** 粘性标记重置要写入 vault — 锁定时按钮置灰。 */
  vaultUnlocked: boolean;
  /** Notify App that entry tints changed so the key list refreshes. */
  onEntriesReset: () => void;
  projects: Project[];
  onClose: () => void;
}) {
  const [section, setSection] = useState<Section>("general");

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>设置</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="settings-shell">
          <nav className="settings-nav">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                className={`settings-nav-item ${section === s.key ? "active" : ""}`}
                onClick={() => setSection(s.key)}
              >
                <span className="settings-nav-icon">{s.icon}</span>
                {s.label}
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {section === "general" && <GeneralPane />}
            {section === "appearance" && (
              <AppearancePane
                theme={theme}
                onThemeChange={onThemeChange}
                fontScale={fontScale}
                onFontScaleChange={onFontScaleChange}
              />
            )}
            {section === "tray" && <TrayPane projects={projects} />}
            {section === "vault" && (
              <VaultPane
                autoLock={autoLock}
                onResetKeyColumns={onResetKeyColumns}
                keyColumnLinesVisible={keyColumnLinesVisible}
                onToggleKeyColumnLines={onToggleKeyColumnLines}
              />
            )}
            {section === "marker" && (
              <MarkerPane
                marker={marker}
                vaultUnlocked={vaultUnlocked}
                onEntriesReset={onEntriesReset}
              />
            )}
            {section === "colors" && <ColorsPane tagColors={tagColors} />}
            {section === "about" && <AboutPane />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- 通用 ---------- */

function GeneralPane() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    isAutostartEnabled()
      .then((value) => {
        if (active) setEnabled(value);
      })
      .catch(() => {
        if (active) setError("无法读取开机自启状态");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const toggle = async () => {
    if (loading || saving) return;

    const next = !enabled;
    setSaving(true);
    setError("");
    try {
      if (next) await enableAutostart();
      else await disableAutostart();
      setEnabled(next);
    } catch {
      setError("设置失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-group">
      <div className="settings-group-head">
        <div>
          <h3 className="settings-group-title">开机自启</h3>
          <p className="settings-group-desc">登录电脑后自动启动 zztodo。</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="开机自启"
          aria-checked={enabled}
          className={`switch ${enabled ? "on" : ""}`}
          disabled={loading || saving}
          onClick={toggle}
        >
          <span className="switch-knob" />
        </button>
      </div>
      {error && <p className="update-hint err">{error}</p>}
    </div>
  );
}

/* ---------- 外观 ---------- */

function AppearancePane({
  theme,
  onThemeChange,
  fontScale,
  onFontScaleChange,
}: {
  theme: Theme;
  onThemeChange: (t: Theme) => void;
  fontScale: FontScale;
  onFontScaleChange: (f: FontScale) => void;
}) {
  return (
    <>
      <div className="settings-group">
        <h3 className="settings-group-title">主题</h3>
        <div className="theme-gallery">
          {THEME_KEYS.map((k) => {
            const meta = THEME_META[k];
            return (
              <button
                key={k}
                className={`theme-card ${theme === k ? "active" : ""}`}
                onClick={() => onThemeChange(k)}
              >
                {meta.swatch ? (
                  <span
                    className="theme-card-preview"
                    style={{ background: meta.swatch[0] }}
                  >
                    <span
                      className="theme-card-window"
                      style={{ background: meta.swatch[1] }}
                    />
                    <span
                      className="theme-card-dot"
                      style={{ background: meta.swatch[2] }}
                    />
                  </span>
                ) : (
                  <span className="theme-card-preview theme-card-preview--system">
                    <span className="theme-card-half theme-card-half--light" />
                    <span className="theme-card-half theme-card-half--dark" />
                  </span>
                )}
                <span className="theme-card-label">
                  {meta.icon} {meta.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-group-title">字号</h3>
        <div className="segmented">
          {FONT_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={`segmented-opt ${fontScale === o.value ? "active" : ""}`}
              onClick={() => onFontScaleChange(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/* ---------- 系统托盘 / 菜单栏 ---------- */

function TrayPane({ projects }: { projects: Project[] }) {
  const [cfg, setCfg] = useState<TrayConfig | null>(null);
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState("");
  const [editingDraft, setEditingDraft] = useState<{
    index: number;
    draft: DraftKey;
  } | null>(null);

  const pinnedProjects = projects.filter((p) => p.pinned);

  useEffect(() => {
    api
      .trayGetConfig()
      .then(setCfg)
      .catch((e) => {
        setError(String(e));
        setCfg(defaultTrayConfig());
      });
  }, []);

  const persist = async (next: TrayConfig) => {
    setCfg(next);
    setError("");
    try {
      setCfg(await api.traySetConfig(next));
      setSavedFlash(`已应用到${platformCopy.tray}`);
      setTimeout(() => setSavedFlash(""), 1600);
    } catch (e) {
      setError(String(e));
    }
  };

  if (!cfg) {
    return <p className="settings-group-desc">加载中…</p>;
  }

  const addExtra = (kind: TrayExtra["kind"]) => {
    let extra: TrayExtra;
    switch (kind) {
      case "pinned_project": {
        const first = pinnedProjects[0];
        if (!first) {
          setError("还没有标记为「重点开发」的项目，先去项目页钉一个");
          return;
        }
        extra = { kind: "pinned_project", project_id: first.id };
        break;
      }
      case "draft_key":
        extra = { kind: "draft_key", draft: emptyDraft() };
        break;
      case "lock_vault":
        extra = { kind: "lock_vault" };
        break;
      case "status_line":
        extra = { kind: "status_line" };
        break;
      case "random_active_folder":
        extra = { kind: "random_active_folder" };
        break;
    }
    // Avoid duplicate of singleton kinds.
    if (
      (kind === "lock_vault" ||
        kind === "status_line" ||
        kind === "random_active_folder") &&
      cfg.extras.some((e) => e.kind === kind)
    ) {
      setError("该项已在列表中");
      return;
    }
    void persist({ ...cfg, extras: [...cfg.extras, extra] });
    if (kind === "draft_key" && extra.kind === "draft_key") {
      setEditingDraft({ index: cfg.extras.length, draft: extra.draft });
    }
  };

  const removeAt = (i: number) => {
    void persist({ ...cfg, extras: cfg.extras.filter((_, idx) => idx !== i) });
  };

  const moveExtra = (from: number, to: number) => {
    if (to < 0 || to >= cfg.extras.length) return;
    const extras = [...cfg.extras];
    const [x] = extras.splice(from, 1);
    extras.splice(to, 0, x);
    void persist({ ...cfg, extras });
  };

  const setPinnedId = (i: number, projectId: number) => {
    const extras = cfg.extras.map((e, idx) =>
      idx === i && e.kind === "pinned_project"
        ? { ...e, project_id: projectId }
        : e,
    );
    void persist({ ...cfg, extras });
  };

  const saveDraft = () => {
    if (!editingDraft) return;
    const extras = cfg.extras.map((e, idx) =>
      idx === editingDraft.index && e.kind === "draft_key"
        ? { kind: "draft_key" as const, draft: editingDraft.draft }
        : e,
    );
    void persist({ ...cfg, extras });
    setEditingDraft(null);
  };

  return (
    <>
      <div className="settings-group">
        <div className="settings-group-head">
          <div>
            <h3 className="settings-group-title">显示{platformCopy.tray}图标</h3>
            <p className="settings-group-desc">
              在 {platformCopy.trayLocation}显示 zztodo，{platformCopy.trayInteraction}。关闭主窗口后仍会驻留在{platformCopy.tray}，选择「退出」才会结束应用。
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={cfg.enabled}
            className={`switch ${cfg.enabled ? "on" : ""}`}
            onClick={() => persist({ ...cfg, enabled: !cfg.enabled })}
          >
            <span className="switch-knob" />
          </button>
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-group-title">固定菜单（不可移除）</h3>
        <p className="settings-group-desc">
          始终出现在菜单顶部，二级列出全部项目名。
        </p>
        <div className="tray-fixed-list">
          <div className="tray-fixed-item">
            <span className="tray-fixed-badge">网站</span>
            <span className="settings-inline-hint">有线上地址的项目 → 浏览器打开</span>
          </div>
          <div className="tray-fixed-item">
            <span className="tray-fixed-badge">文件夹</span>
            <span className="settings-inline-hint">
              有本地路径的项目 → {platformCopy.openFolder}
            </span>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-head">
          <div>
            <h3 className="settings-group-title">自定义条目</h3>
            <p className="settings-group-desc">
              插在「网站 / 文件夹」与「显示 zztodo / 退出」之间。可上下调整顺序。
            </p>
          </div>
        </div>

        {cfg.extras.length === 0 ? (
          <p className="settings-inline-hint">还没有自定义条目，从下方添加</p>
        ) : (
          <div className="tray-extra-list">
            {cfg.extras.map((extra, i) => (
              <div key={i} className="tray-extra-row">
                <div className="tray-extra-main">
                  <span className="tray-extra-kind">
                    {TRAY_EXTRA_META.find((m) => m.kind === extra.kind)?.label ??
                      extra.kind}
                  </span>
                  {extra.kind === "pinned_project" && (
                    <select
                      className="settings-select tray-extra-select"
                      value={extra.project_id}
                      onChange={(e) => setPinnedId(i, Number(e.target.value))}
                    >
                      {pinnedProjects.length === 0 && (
                        <option value={extra.project_id}>（无重点项目）</option>
                      )}
                      {pinnedProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                      {/* Keep current selection visible even if unpinned later */}
                      {!pinnedProjects.some((p) => p.id === extra.project_id) &&
                        (() => {
                          const orphan = projects.find((p) => p.id === extra.project_id);
                          return orphan ? (
                            <option value={orphan.id}>{orphan.name}（已取消重点）</option>
                          ) : (
                            <option value={extra.project_id}>项目已删除</option>
                          );
                        })()}
                    </select>
                  )}
                  {extra.kind === "draft_key" && (
                    <button
                      type="button"
                      className="mini"
                      onClick={() =>
                        setEditingDraft({ index: i, draft: { ...extra.draft } })
                      }
                    >
                      编辑「{extra.draft.name || "未命名"}」
                    </button>
                  )}
                  {extra.kind !== "pinned_project" && extra.kind !== "draft_key" && (
                    <span className="settings-inline-hint">
                      {TRAY_EXTRA_META.find((m) => m.kind === extra.kind)?.desc}
                    </span>
                  )}
                </div>
                <div className="tray-extra-actions">
                  <button
                    type="button"
                    className="mini"
                    disabled={i === 0}
                    onClick={() => moveExtra(i, i - 1)}
                    title="上移"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="mini"
                    disabled={i === cfg.extras.length - 1}
                    onClick={() => moveExtra(i, i + 1)}
                    title="下移"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="mini mini--danger"
                    onClick={() => removeAt(i)}
                  >
                    移除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="tray-add-row">
          {TRAY_EXTRA_META.map((m) => (
            <button
              key={m.kind}
              type="button"
              className="btn"
              title={m.desc}
              onClick={() => addExtra(m.kind)}
            >
              ＋ {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-group-title">菜单预览结构</h3>
        <pre className="tray-preview">
{`网站  ▸  （全部有 URL 的项目）
文件夹  ▸  （全部有路径的项目）
────────────────
${cfg.extras
  .map((e) => {
    if (e.kind === "pinned_project") {
      const n = projects.find((p) => p.id === e.project_id)?.name ?? "?";
      return `★ ${n}  ▸  仓库 / 网站 / 文件夹`;
    }
    if (e.kind === "draft_key") {
      return `🔑 ${e.draft.name || "草稿"}  ▸  复制 key / baseurl / 模型 / 全家桶 / 打开站`;
    }
    if (e.kind === "lock_vault") return `锁定 Key 库`;
    if (e.kind === "status_line") return `进行中 N · 重点 M · 共 K`;
    return `🎲 随机打开进行中项目`;
  })
  .join("\n")}
────────────────
显示 zztodo
退出`}
        </pre>
      </div>

      {error && <p className="update-hint err">{error}</p>}
      {savedFlash && <p className="settings-inline-hint ok">{savedFlash}</p>}

      {editingDraft && (
        <div className="overlay overlay--stacked" onClick={() => setEditingDraft(null)}>
          <div
            className="modal"
            style={{ maxWidth: 480 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-head">
              <h2>编辑草稿 Key</h2>
              <button className="icon-btn" onClick={() => setEditingDraft(null)}>
                ✕
              </button>
            </header>
            <div className="modal-body">
              <p className="settings-group-desc">
                ⚠️ 草稿 Key 以<strong>明文</strong>保存在本机配置里，不进加密库，适合长期临时中转
                / 测试用。敏感生产密钥请放进 zzkey。
              </p>
              <label className="field">
                <span>显示名</span>
                <input
                  value={editingDraft.draft.name}
                  onChange={(e) =>
                    setEditingDraft({
                      ...editingDraft,
                      draft: { ...editingDraft.draft, name: e.target.value },
                    })
                  }
                  placeholder="如 临时中转"
                />
              </label>
              <label className="field">
                <span>baseurl</span>
                <input
                  value={editingDraft.draft.base_url}
                  onChange={(e) =>
                    setEditingDraft({
                      ...editingDraft,
                      draft: { ...editingDraft.draft, base_url: e.target.value },
                    })
                  }
                  placeholder="https://api.example.com/v1"
                />
              </label>
              <label className="field">
                <span>API Key</span>
                <input
                  value={editingDraft.draft.api_key}
                  onChange={(e) =>
                    setEditingDraft({
                      ...editingDraft,
                      draft: { ...editingDraft.draft, api_key: e.target.value },
                    })
                  }
                  placeholder="sk-…"
                />
              </label>
              <label className="field">
                <span>模型 id</span>
                <input
                  value={editingDraft.draft.model_id}
                  onChange={(e) =>
                    setEditingDraft({
                      ...editingDraft,
                      draft: { ...editingDraft.draft, model_id: e.target.value },
                    })
                  }
                  placeholder="gpt-4o-mini"
                />
              </label>
              <div className="field-row">
                <label className="field">
                  <span>文档站</span>
                  <input
                    value={editingDraft.draft.docs_url}
                    onChange={(e) =>
                      setEditingDraft({
                        ...editingDraft,
                        draft: { ...editingDraft.draft, docs_url: e.target.value },
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>控制台</span>
                  <input
                    value={editingDraft.draft.console_url}
                    onChange={(e) =>
                      setEditingDraft({
                        ...editingDraft,
                        draft: {
                          ...editingDraft.draft,
                          console_url: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              </div>
            </div>
            <footer className="modal-foot">
              <div className="spacer" />
              <button className="btn" onClick={() => setEditingDraft(null)}>
                取消
              </button>
              <button className="btn primary" onClick={saveDraft}>
                保存
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Key 库 ---------- */

function VaultPane({
  autoLock,
  onResetKeyColumns,
  keyColumnLinesVisible,
  onToggleKeyColumnLines,
}: {
  autoLock: ReturnType<typeof useAutoLock>;
  onResetKeyColumns: () => void;
  keyColumnLinesVisible: boolean;
  onToggleKeyColumnLines: () => void;
}) {
  return (
    <>
      <div className="settings-group">
        <h3 className="settings-group-title">自动锁定</h3>
        <p className="settings-group-desc">闲置超过设定时间后自动锁定 Key 库。</p>
        <select
          className="settings-select"
          value={autoLock.minutes}
          onChange={(e) => autoLock.setMinutes(Number(e.target.value))}
        >
          {AUTOLOCK_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-group">
        <h3 className="settings-group-title">列表列宽</h3>
        <p className="settings-group-desc">拖动列分隔线调整宽度，或在此恢复默认布局。</p>
        <div className="settings-row-actions">
          <button className="btn" onClick={onToggleKeyColumnLines}>
            {keyColumnLinesVisible ? "隐藏分隔线" : "显示分隔线"}
          </button>
          <button className="btn" onClick={onResetKeyColumns}>
            重置为默认
          </button>
        </div>
      </div>
    </>
  );
}

/* ---------- 粘性标记 ---------- */

function MarkerPane({
  marker,
  vaultUnlocked,
  onEntriesReset,
}: {
  marker: StickyMarker;
  vaultUnlocked: boolean;
  onEntriesReset: () => void;
}) {
  const [resetMsg, setResetMsg] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  /**
   * Pointer-based reorder (HTML5 DnD is flaky in WKWebView and has no live
   * feedback). Local draft order updates every frame while dragging; prefs
   * only commit on pointerup. A fixed-position clone follows the cursor.
   */
  const chipRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const draftRef = useRef<string[] | null>(null);
  const drag = useRef<{
    cur: number;
    color: string;
    offX: number;
    offY: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [float, setFloat] = useState<{
    x: number;
    y: number;
    color: string;
    cur: number;
  } | null>(null);

  const colors = draft ?? marker.colors;

  const insertionIndex = (x: number, y: number): number => {
    const chips = chipRefs.current;
    for (let j = 0; j < chips.length; j++) {
      const r = chips[j]?.getBoundingClientRect();
      if (!r) continue;
      if (y < r.top) return j;
      if (y < r.bottom && x < r.left + r.width / 2) return j;
    }
    return chips.length;
  };

  const onChipPointerDown = (e: ReactPointerEvent<HTMLSpanElement>, i: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const startColors = [...marker.colors];
    draftRef.current = startColors;
    drag.current = {
      cur: i,
      color: startColors[i],
      offX: e.clientX - r.left,
      offY: e.clientY - r.top,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
    };

    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.active) {
        if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < 4) return;
        d.active = true;
        setDraft([...startColors]);
      }
      const order = draftRef.current ?? startColors;
      const to = insertionIndex(ev.clientX, ev.clientY);
      const final = Math.max(0, Math.min(MARKER_COLOR_COUNT - 1, to > d.cur ? to - 1 : to));
      if (final !== d.cur) {
        const next = [...order];
        const [c] = next.splice(d.cur, 1);
        next.splice(final, 0, c);
        d.cur = final;
        draftRef.current = next;
        setDraft(next);
      }
      setFloat({
        x: ev.clientX - d.offX,
        y: ev.clientY - d.offY,
        color: d.color,
        cur: d.cur,
      });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const d = drag.current;
      const finalOrder = draftRef.current;
      drag.current = null;
      draftRef.current = null;
      setFloat(null);
      setDraft(null);
      if (d?.active && finalOrder) {
        marker.setColorOrder(finalOrder);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const reset = async () => {
    if (resetBusy) return;
    if (!window.confirm("将所有带颜色的条目恢复为原始外观？")) return;
    setResetBusy(true);
    setResetMsg("");
    try {
      const n = await vaultApi.resetEntryColors();
      setResetMsg(n > 0 ? `已重置 ${n} 个条目` : "没有带颜色的条目");
      onEntriesReset();
    } catch (e) {
      setResetMsg(String(e));
    } finally {
      setResetBusy(false);
    }
  };

  const dragging = float !== null;
  const dragCur = float?.cur ?? -1;

  return (
    <>
      <div className="settings-group">
        <div className="settings-group-head">
          <div>
            <h3 className="settings-group-title">开启粘性标记</h3>
            <p className="settings-group-desc">
              在 Key 列表顶部显示「粘性标记」按钮，其颜色将应用到新建的条目上。
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={marker.enabled}
            className={`switch ${marker.enabled ? "on" : ""}`}
            onClick={() => marker.setEnabled(!marker.enabled)}
          >
            <span className="switch-knob" />
          </button>
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-group-title">重置</h3>
        <p className="settings-group-desc">
          一键清除所有条目上的标记颜色，恢复原始外观。
        </p>
        <div className="settings-row-actions">
          <button
            className="btn"
            disabled={!vaultUnlocked || resetBusy}
            title={vaultUnlocked ? undefined : "解锁 Key 库后可重置"}
            onClick={reset}
          >
            {resetBusy ? "重置中…" : "重置所有条目颜色"}
          </button>
          {!vaultUnlocked && (
            <span className="settings-inline-hint">解锁 Key 库后可重置</span>
          )}
        </div>
        {resetMsg && <p className="settings-inline-hint ok">{resetMsg}</p>}
      </div>

      <div className="settings-group">
        <h3 className="settings-group-title">点击</h3>
        <p className="settings-group-desc">点击「粘性标记」按钮时切换颜色的方式。</p>
        <div className="segmented segmented--wrap">
          {MARKER_CLICK_MODES.map((m) => (
            <button
              key={m.value}
              className={`segmented-opt ${marker.clickMode === m.value ? "active" : ""}`}
              onClick={() => marker.setClickMode(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-head">
          <div>
            <h3 className="settings-group-title">颜色</h3>
            <p className="settings-group-desc">
              白色固定在最前（原始状态），按住拖动调整其余 {MARKER_COLOR_COUNT}{" "}
              种浅色的顺序。
            </p>
          </div>
          <button className="mini" onClick={marker.resetColors} disabled={dragging}>
            恢复默认
          </button>
        </div>
        <div className={`marker-colors ${dragging ? "is-dragging" : ""}`}>
          <span
            className="marker-color marker-color--white"
            title="白色（原始状态，固定在最前）"
          >
            <span className="marker-color-dot marker-color-dot--white" />
            <span className="marker-color-name">白</span>
          </span>
          {colors.map((c, i) => (
            <span
              key={c}
              ref={(el) => {
                chipRefs.current[i] = el;
              }}
              className={`marker-color ${dragCur === i ? "is-src" : ""}`}
              title={`拖动调整顺序（第 ${i + 1} 位）`}
              onPointerDown={(e) => onChipPointerDown(e, i)}
            >
              <span className="marker-color-dot" style={{ background: c }} />
              <span className="marker-color-name">{i + 1}</span>
            </span>
          ))}
        </div>
      </div>

      {float &&
        createPortal(
          <span
            className="marker-color marker-color--float"
            style={{ left: float.x, top: float.y }}
            aria-hidden
          >
            <span className="marker-color-dot" style={{ background: float.color }} />
            <span className="marker-color-name">↕</span>
          </span>,
          document.body,
        )}
    </>
  );
}

/* ---------- 配色（项目标签） ---------- */

function ColorsPane({ tagColors }: { tagColors: ReturnType<typeof useTagColors> }) {
  return (
    <>
      <div className="settings-group">
        <h3 className="settings-group-title">标签颜色</h3>
        <p className="settings-group-desc">项目「重点开发 / 收藏」标记的显示颜色。</p>
        <div className="tag-swatches">
          {TAG_KEYS.map((k) => (
            <label key={k} className="swatch" title={TAG_META[k].label}>
              <input
                type="color"
                value={tagColors.colors[k]}
                onChange={(e) => tagColors.setColor(k, e.target.value)}
              />
              <span className="swatch-dot" style={{ background: tagColors.colors[k] }} />
              <span className="swatch-label">{TAG_META[k].label}</span>
            </label>
          ))}
          <button className="btn" onClick={tagColors.randomize}>
            🎲 随机配色
          </button>
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-group-title">保存配色</h3>
        <p className="settings-group-desc">把当前配色存成预设，随时一键换回。</p>
        <div className="palette-slots">
          {Array.from({ length: tagColors.maxPalettes }).map((_, i) => (
            <div key={i} className="palette-slot">
              <div className="palette-preview">
                {TAG_KEYS.map((k) => (
                  <span
                    key={k}
                    className="palette-dot"
                    style={{ background: tagColors.palettes[i]?.[k] || "#ddd" }}
                  />
                ))}
              </div>
              <button className="mini" onClick={() => tagColors.saveToSlot(i)}>
                保存到 {i + 1}
              </button>
              <button
                className="mini"
                disabled={!tagColors.palettes[i]}
                onClick={() => tagColors.loadFromSlot(i)}
              >
                应用
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ---------- 关于 ---------- */

function AboutPane() {
  const [version, setVersion] = useState("");
  const [update, setUpdate] = useState<UpdateState>({ kind: "idle" });

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  const checkForUpdates = async () => {
    setUpdate({ kind: "checking" });
    try {
      const result = await check();
      if (result) {
        setUpdate({ kind: "available", version: result.version, update: result });
      } else {
        setUpdate({ kind: "latest" });
      }
    } catch {
      setUpdate({ kind: "error" });
    }
  };

  const installUpdate = async (update: Update) => {
    setUpdate({ kind: "downloading", progress: 0 });
    try {
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength || 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setUpdate({
            kind: "downloading",
            progress: total ? Math.round((downloaded / total) * 100) : 0,
          });
        }
      });
      setUpdate({ kind: "ready" });
      await relaunch();
    } catch {
      setUpdate({ kind: "error" });
    }
  };

  return (
    <>
      <div className="settings-group">
        <h3 className="settings-group-title">作者</h3>
        <button
          className="about-author"
          type="button"
          onClick={() => openUrl("https://github.com/qxryz/zztodo").catch(() => {})}
          title="打开 GitHub 仓库"
        >
          作者：qxryz（自用，free）
        </button>
      </div>

      <div className="settings-group">
        <h3 className="settings-group-title">版本</h3>
        <div className="update-check">
          <span className="version-num">v{version}</span>
          <button
            className="btn"
            onClick={checkForUpdates}
            disabled={update.kind === "checking"}
          >
            {update.kind === "checking" ? "检查中…" : "检查更新"}
          </button>
        </div>

        {update.kind === "latest" && <p className="update-hint ok">已是最新版本</p>}
        {update.kind === "error" && (
          <p className="update-hint err">检查失败，请稍后重试</p>
        )}
        {update.kind === "available" && (
          <p className="update-hint available">
            发现新版本 v{update.version}，
            <button className="link-btn" onClick={() => installUpdate(update.update)}>
              立即更新
            </button>
          </p>
        )}
        {update.kind === "downloading" && (
          <p className="update-hint available">下载中… {update.progress}%</p>
        )}
        {update.kind === "ready" && <p className="update-hint ok">安装完成，正在重启…</p>}
      </div>
    </>
  );
}
