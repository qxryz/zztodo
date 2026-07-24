import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { Project, STATUS_META } from "../types";

export function ProjectCard({
  project,
  onOpen,
}: {
  project: Project;
  onOpen: () => void;
}) {
  const meta = STATUS_META[project.status];

  const reveal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (project.folder) await revealItemInDir(project.folder).catch(() => {});
  };
  const visit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (project.url) await openPath(project.url).catch(() => {});
  };

  return (
    <article className="card" onClick={onOpen}>
      <div className="card-head">
        <span className="status-badge" style={{ ["--c" as string]: meta.color }}>
          <span className="dot" style={{ background: meta.color }} />
          {meta.label}
        </span>
        {project.deployed && <span className="live-badge">● LIVE</span>}
      </div>

      <h3 className="card-title">{project.name}</h3>
      {project.description && (
        <p className="card-desc">{project.description}</p>
      )}

      {project.tech_stack.length > 0 && (
        <div className="tags">
          {project.tech_stack.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="progress-row">
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${project.progress}%`, background: meta.color }}
          />
        </div>
        <span className="progress-num">{project.progress}%</span>
      </div>

      <div className="card-foot">
        {project.folder && (
          <button className="mini" onClick={reveal} title={project.folder}>
            📁 文件夹
          </button>
        )}
        {project.url && (
          <button className="mini" onClick={visit} title={project.url}>
            🔗 访问
          </button>
        )}
        {project.deploy_method && (
          <span className="deploy-tag">{project.deploy_method}</span>
        )}
      </div>
    </article>
  );
}
