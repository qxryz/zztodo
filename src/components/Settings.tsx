import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { FontScale, TAG_META, THEME_META, TagKey, Theme } from "../types";
import type { useTagColors } from "../useTagColors";
import {
  MARKER_CLICK_MODES,
  MARKER_COLOR_COUNT,
  type StickyMarker,
} from "../useStickyMarker";
import { vaultApi } from "../vault/api";
import { AUTOLOCK_OPTIONS, type useAutoLock } from "../vault/useAutoLock";

const TAG_KEYS = Object.keys(TAG_META) as TagKey[];
const THEME_KEYS = Object.keys(THEME_META) as Theme[];

const FONT_OPTIONS: { value: FontScale; label: string }[] = [
  { value: "sm", label: "小" },
  { value: "md", label: "中" },
  { value: "lg", label: "大" },
];

type Section = "appearance" | "vault" | "marker" | "colors" | "about";

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: "appearance", label: "外观", icon: "🎨" },
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
  onClose: () => void;
}) {
  const [section, setSection] = useState<Section>("appearance");

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
            {section === "appearance" && (
              <AppearancePane
                theme={theme}
                onThemeChange={onThemeChange}
                fontScale={fontScale}
                onFontScaleChange={onFontScaleChange}
              />
            )}
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
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

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

  const drop = (to: number) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    setDragOver(null);
    if (from !== null && from !== to) marker.moveColor(from, to);
  };

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
              白色固定在最前（原始状态），拖动调整其余 {MARKER_COLOR_COUNT} 种浅色的顺序。
            </p>
          </div>
          <button className="mini" onClick={marker.resetColors}>
            恢复默认
          </button>
        </div>
        <div className="marker-colors">
          <span
            className="marker-color marker-color--white"
            title="白色（原始状态，固定在最前）"
          >
            <span className="marker-color-dot marker-color-dot--white" />
            <span className="marker-color-name">白</span>
          </span>
          {marker.colors.map((c, i) => (
            <span
              key={c}
              className={`marker-color ${dragOver === i ? "drag-over" : ""}`}
              draggable
              title={`拖动调整顺序（第 ${i + 1} 位）`}
              onDragStart={(e) => {
                dragFrom.current = i;
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOver(i);
              }}
              onDragLeave={() => setDragOver((v) => (v === i ? null : v))}
              onDrop={(e) => {
                e.preventDefault();
                drop(i);
              }}
              onDragEnd={() => {
                dragFrom.current = null;
                setDragOver(null);
              }}
            >
              <span className="marker-color-dot" style={{ background: c }} />
              <span className="marker-color-name">{i + 1}</span>
            </span>
          ))}
        </div>
      </div>
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
  );
}
