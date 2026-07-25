import type { CSSProperties } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Project } from "../../types";
import type { EntryMeta } from "../../vault/types";

export function KeyRow({
  entry,
  projects,
  selected,
  onSelect,
  onOpen,
  onContextMenu,
  columnStyle,
}: {
  entry: EntryMeta;
  projects: Project[];
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  /** Inline `--col-*` CSS variables that override the row's grid template. */
  columnStyle?: CSSProperties;
}) {
  // Projects deleted from the projects page are simply ignored here.
  const linked = entry.project_ids
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is Project => Boolean(p));

  const visit = (url: string) => async (e: React.MouseEvent) => {
    e.stopPropagation();
    await openUrl(url).catch(() => {});
  };

  return (
    <div
      className={`key-row ${selected ? "selected" : ""}`}
      style={columnStyle}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onContextMenu={onContextMenu}
    >
      <div className="key-row-main">
        <span className="key-title">{entry.title || "未命名"}</span>
        {entry.purpose && <span className="key-purpose">{entry.purpose}</span>}
      </div>

      <div className="key-projects">
        {linked.map((p) => (
          <span key={p.id} className="key-proj-badge" title={p.name}>
            {p.name}
          </span>
        ))}
      </div>

      <div className="key-tags">
        {entry.tags.map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
      </div>

      <span className="key-env" title={entry.env_var}>
        {entry.env_var}
      </span>

      <span className="key-model" title={entry.model_id || "未设置模型 id"}>
        {entry.model_id || "—"}
      </span>

      <div className="key-row-actions">
        {entry.attachments.length > 0 && (
          <span className="key-attach-count" title={`${entry.attachments.length} 个附件`}>
            📎{entry.attachments.length}
          </span>
        )}
        {entry.docs_url && (
          <button className="mini" title={`文档：${entry.docs_url}`} onClick={visit(entry.docs_url)}>
            📄
          </button>
        )}
        {entry.console_url && (
          <button
            className="mini"
            title={`控制台：${entry.console_url}`}
            onClick={visit(entry.console_url)}
          >
            🖥
          </button>
        )}
      </div>

      <span className="key-updated">{entry.updated_at.slice(0, 10)}</span>
    </div>
  );
}
