export interface Project {
  id: number;
  name: string;
  folder: string;
  description: string;
  tech_stack: string[];
  status: Status;
  deployed: boolean;
  deploy_method: string;
  open_source: boolean;
  pinned: boolean;
  favorite: boolean;
  url: string;
  repo: string;
  notes: string;
  progress: number;
  created_at: string;
  updated_at: string;
}

export type ProjectInput = Omit<Project, "id" | "created_at" | "updated_at">;

export type Status = "idea" | "active" | "paused" | "done" | "archived";

export interface FolderScan {
  suggested_name: string;
  tech_stack: string[];
  repo: string;
}

export const STATUS_META: Record<Status, { label: string; color: string }> = {
  idea: { label: "想法", color: "#8b95a7" },
  active: { label: "进行中", color: "#4f9dff" },
  paused: { label: "暂停", color: "#f0a742" },
  done: { label: "已完成", color: "#3ecf8e" },
  archived: { label: "归档", color: "#6b7280" },
};

export type Theme = "light" | "dark" | "system";

export type FontScale = "sm" | "md" | "lg";

export type Layout = "grid" | "list";

export type AppMode = "projects" | "keys";

export type TagKey = "pinned" | "favorite";

export const TAG_META: Record<TagKey, { label: string; defaultColor: string }> = {
  pinned: { label: "重点开发", defaultColor: "#f0a742" },
  favorite: { label: "收藏", defaultColor: "#e05d9c" },
};

export function emptyInput(): ProjectInput {
  return {
    name: "",
    folder: "",
    description: "",
    tech_stack: [],
    status: "active",
    deployed: false,
    deploy_method: "",
    open_source: false,
    pinned: false,
    favorite: false,
    url: "",
    repo: "",
    notes: "",
    progress: 0,
  };
}
