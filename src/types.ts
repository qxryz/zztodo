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

export type Theme =
  | "light"
  | "dark"
  | "system"
  | "latte"
  | "mint"
  | "sakura"
  | "ocean"
  | "graphite";

/** Gallery metadata for the settings theme picker. `system` tracks the OS
 * between light/dark and needs no palette of its own. */
export const THEME_META: Record<
  Theme,
  { label: string; icon: string; dark: boolean; swatch: [string, string, string] | null }
> = {
  light: { label: "明亮", icon: "☀️", dark: false, swatch: ["#f6f7f9", "#ffffff", "#2f7ff0"] },
  dark: { label: "暗夜", icon: "🌙", dark: true, swatch: ["#0f1115", "#171a21", "#4f9dff"] },
  system: { label: "跟随系统", icon: "⌘", dark: false, swatch: null },
  latte: { label: "奶咖", icon: "☕", dark: false, swatch: ["#f4eee4", "#fcfaf4", "#bd7a35"] },
  mint: { label: "薄荷", icon: "🌿", dark: false, swatch: ["#edf5f0", "#fafdfb", "#1d9d68"] },
  sakura: { label: "樱花", icon: "🌸", dark: false, swatch: ["#f9f0f2", "#fffbfc", "#d15c87"] },
  ocean: { label: "海洋", icon: "🌊", dark: true, swatch: ["#0c1521", "#121e2e", "#37b4e6"] },
  graphite: { label: "石墨", icon: "🪨", dark: true, swatch: ["#181818", "#202020", "#d2a94e"] },
};

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
