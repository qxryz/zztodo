import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { FontScale, TAG_META, TagKey, Theme } from "../types";
import type { useTagColors } from "../useTagColors";
import { ThemeSwitch } from "./ThemeSwitch";

const TAG_KEYS = Object.keys(TAG_META) as TagKey[];

const FONT_OPTIONS: { value: FontScale; label: string }[] = [
  { value: "sm", label: "小" },
  { value: "md", label: "中" },
  { value: "lg", label: "大" },
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
  onClose,
}: {
  theme: Theme;
  onThemeChange: (t: Theme) => void;
  fontScale: FontScale;
  onFontScaleChange: (f: FontScale) => void;
  tagColors: ReturnType<typeof useTagColors>;
  onClose: () => void;
}) {
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
    <div className="overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>设置</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="modal-body">
          <div className="settings-row">
            <span>主题</span>
            <ThemeSwitch theme={theme} onChange={onThemeChange} />
          </div>

          <div className="settings-row">
            <span>字号</span>
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

          <div className="settings-row">
            <span>版本</span>
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
          </div>

          {update.kind === "latest" && (
            <p className="update-hint ok">已是最新版本</p>
          )}
          {update.kind === "error" && (
            <p className="update-hint err">检查失败，请稍后重试</p>
          )}
          {update.kind === "available" && (
            <p className="update-hint available">
              发现新版本 v{update.version}，
              <button
                className="link-btn"
                onClick={() => installUpdate(update.update)}
              >
                立即更新
              </button>
            </p>
          )}
          {update.kind === "downloading" && (
            <p className="update-hint available">下载中… {update.progress}%</p>
          )}
          {update.kind === "ready" && (
            <p className="update-hint ok">安装完成，正在重启…</p>
          )}

          <div className="settings-row tag-color-row">
            <span>标签颜色</span>
            <div className="tag-swatches">
              {TAG_KEYS.map((k) => (
                <label key={k} className="swatch" title={TAG_META[k].label}>
                  <input
                    type="color"
                    value={tagColors.colors[k]}
                    onChange={(e) => tagColors.setColor(k, e.target.value)}
                  />
                  <span
                    className="swatch-dot"
                    style={{ background: tagColors.colors[k] }}
                  />
                  <span className="swatch-label">{TAG_META[k].label}</span>
                </label>
              ))}
              <button className="btn" onClick={tagColors.randomize}>
                🎲 随机配色
              </button>
            </div>
          </div>

          <div className="settings-row palette-row">
            <span>保存配色</span>
            <div className="palette-slots">
              {Array.from({ length: tagColors.maxPalettes }).map((_, i) => (
                <div key={i} className="palette-slot">
                  <div className="palette-preview">
                    {TAG_KEYS.map((k) => (
                      <span
                        key={k}
                        className="palette-dot"
                        style={{
                          background: tagColors.palettes[i]?.[k] || "#ddd",
                        }}
                      />
                    ))}
                  </div>
                  <button
                    className="mini"
                    onClick={() => tagColors.saveToSlot(i)}
                  >
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
        </div>
      </div>
    </div>
  );
}
