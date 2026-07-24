import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { Project, STATUS_META, TAG_META } from "../types";
import type { TagColors } from "../useTagColors";

export function ProjectRow({
  project,
  tagColors,
  onOpen,
}: {
  project: Project;
  tagColors: TagColors;
  onOpen: () => void;
}) {
  const meta = STATUS_META[project.status];

  const reveal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (project.folder) await revealItemInDir(project.folder).catch(() => {});
  };
  const visit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (project.url) await openUrl(project.url).catch(() => {});
  };

  return (
    <div className="row" onClick={onOpen}>
      <span className="status-badge" style={{ ["--c" as string]: meta.color }}>
        <span className="dot" style={{ background: meta.color }} />
        {meta.label}
      </span>

      <div className="row-main">
        <span className="row-title">{project.name}</span>
        {project.description && (
          <span className="row-desc">{project.description}</span>
        )}
      </div>

      <div className="row-tags">
        {project.pinned && (
          <span className="mini-badge" style={{ ["--c" as string]: tagColors.pinned }}>
            {TAG_META.pinned.label}
          </span>
        )}
        {project.favorite && (
          <span className="mini-badge" style={{ ["--c" as string]: tagColors.favorite }}>
            {TAG_META.favorite.label}
          </span>
        )}
        {project.deployed && <span className="live-badge">● LIVE</span>}
        {project.open_source && <span className="oss-badge">⌥ OSS</span>}
      </div>

      <div className="row-progress">
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${project.progress}%`, background: meta.color }}
          />
        </div>
        <span className="progress-num">{project.progress}%</span>
      </div>

      <div className="row-actions">
        {project.folder && (
          <button className="mini" onClick={reveal} title={project.folder}>
            📁
          </button>
        )}
        {project.url && (
          <button className="mini" onClick={visit} title={project.url}>
            🔗
          </button>
        )}
      </div>
    </div>
  );
}
