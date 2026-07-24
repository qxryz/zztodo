import { invoke } from "@tauri-apps/api/core";
import type { Project, ProjectInput, FolderScan } from "./types";

export const api = {
  list: () => invoke<Project[]>("list_projects"),
  create: (input: ProjectInput) => invoke<Project>("create_project", { input }),
  update: (id: number, input: ProjectInput) =>
    invoke<Project>("update_project", { id, input }),
  remove: (id: number) => invoke<void>("delete_project", { id }),
  scan: (folder: string) => invoke<FolderScan>("scan_folder", { folder }),
};
