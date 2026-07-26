/** Mirrors src-tauri/src/tray.rs config types. */

export interface DraftKey {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  model_id: string;
  docs_url: string;
  console_url: string;
}

export type TrayExtra =
  | { kind: "pinned_project"; project_id: number }
  | { kind: "draft_key"; draft: DraftKey }
  | { kind: "lock_vault" }
  | { kind: "status_line" }
  | { kind: "random_active_folder" };

export interface TrayConfig {
  enabled: boolean;
  extras: TrayExtra[];
}

export const TRAY_EXTRA_META: {
  kind: TrayExtra["kind"];
  label: string;
  desc: string;
}[] = [
  {
    kind: "pinned_project",
    label: "重点项目",
    desc: "一级菜单直接显示项目名，二级可开仓库 / 网站 / 文件夹",
  },
  {
    kind: "draft_key",
    label: "草稿 Key",
    desc: "明文存放 baseurl / API key / 模型 id，菜单一键复制（不进加密库）",
  },
  {
    kind: "lock_vault",
    label: "锁定 Key 库",
    desc: "菜单里一键锁定 vault",
  },
  {
    kind: "status_line",
    label: "项目速览",
    desc: "显示进行中 / 重点 / 总数（只读）",
  },
  {
    kind: "random_active_folder",
    label: "随机进行中",
    desc: "随机打开一个「进行中」项目的本地文件夹",
  },
];

export function emptyDraft(): DraftKey {
  return {
    id: crypto.randomUUID(),
    name: "临时草稿",
    base_url: "",
    api_key: "",
    model_id: "",
    docs_url: "",
    console_url: "",
  };
}

export function defaultTrayConfig(): TrayConfig {
  return {
    enabled: true,
    extras: [{ kind: "status_line" }, { kind: "lock_vault" }],
  };
}
