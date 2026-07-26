import { invoke } from "@tauri-apps/api/core";
import type { Project, ProjectInput, FolderScan } from "./types";
import type { TrayConfig } from "./trayTypes";

export const api = {
  list: () => invoke<Project[]>("list_projects"),
  create: (input: ProjectInput) => invoke<Project>("create_project", { input }),
  update: (id: number, input: ProjectInput) =>
    invoke<Project>("update_project", { id, input }),
  remove: (id: number) => invoke<void>("delete_project", { id }),
  scan: (folder: string) => invoke<FolderScan>("scan_folder", { folder }),

  trayGetConfig: () => invoke<TrayConfig>("tray_get_config"),
  traySetConfig: (config: TrayConfig) =>
    invoke<TrayConfig>("tray_set_config", { config }),
  trayRebuild: () => invoke<void>("tray_rebuild"),
};
