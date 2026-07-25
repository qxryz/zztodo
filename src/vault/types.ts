/** Mirrors the Rust types in src-tauri/src/vault_commands.rs. */

export type VaultStateKind = "uninitialized" | "locked" | "unlocked";

export interface VaultStatus {
  state: VaultStateKind;
  file_size: number;
  path: string;
}

export interface AttachmentMeta {
  name: string;
  size: number;
}

/** Entry as returned by the list projection: no secret, attachments without data. */
export interface EntryMeta {
  id: number;
  title: string;
  project_ids: number[];
  base_url: string;
  docs_url: string;
  console_url: string;
  purpose: string;
  model_id: string;
  tags: string[];
  username: string;
  env_var: string;
  notes: string;
  attachments: AttachmentMeta[];
  created_at: string;
  updated_at: string;
}

export interface EntryInput {
  id: number | null;
  title: string;
  project_ids: number[];
  base_url: string;
  docs_url: string;
  console_url: string;
  purpose: string;
  model_id: string;
  tags: string[];
  username: string;
  env_var: string;
  notes: string;
  /** null keeps the stored secret unchanged. */
  secret: string | null;
}

/** Fixed billing tags a key may carry. At most one of them per entry. */
export type FixedTag = "订阅" | "按量计费";
export const FIXED_TAGS: FixedTag[] = ["订阅", "按量计费"];

/** Max number of projects a single key can bind to. */
export const MAX_PROJECTS_PER_KEY = 2;
/** Max number of tags a single key can carry (1 custom + 1 fixed). */
export const MAX_TAGS_PER_KEY = 2;

export interface ProviderTemplate {
  id: number;
  name: string;
  base_url: string;
  docs_url: string;
  console_url: string;
}

export interface ProviderInput {
  id: number | null;
  name: string;
  base_url: string;
  docs_url: string;
  console_url: string;
}

/** A provider option shown in the picker: either builtin or a user template. */
export type ProviderOption = Omit<ProviderTemplate, "id"> & {
  id: number | null;
  builtin: boolean;
};

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

export const ERR_BAD_PASSWORD = "密码错误或文件损坏";

export const MASTER_PASSWORD_WARNING =
  "⚠️ 主密码无法找回。忘记主密码后数据将永久无法解密，只能删除库文件重建。";

export function emptyEntryInput(): EntryInput {
  return {
    id: null,
    title: "",
    project_ids: [],
    base_url: "",
    docs_url: "",
    console_url: "",
    purpose: "",
    model_id: "",
    tags: [],
    username: "",
    env_var: "",
    notes: "",
    secret: "",
  };
}

export function entryToInput(e: EntryMeta): EntryInput {
  return {
    id: e.id,
    title: e.title,
    project_ids: [...e.project_ids],
    base_url: e.base_url,
    docs_url: e.docs_url,
    console_url: e.console_url,
    purpose: e.purpose,
    model_id: e.model_id,
    tags: [...e.tags],
    username: e.username,
    env_var: e.env_var,
    notes: e.notes,
    secret: null,
  };
}

/**
 * Split a stored tag array into the editable custom-tag text and the chosen
 * fixed billing tag. Tolerant of legacy data that doesn't follow the new rule.
 */
export function splitTags(
  tags: string[],
): { custom: string; fixed: FixedTag | "" } {
  const fixed = tags.find((t): t is FixedTag =>
    (FIXED_TAGS as string[]).includes(t),
  ) ?? "";
  const custom = tags.find((t) => !(FIXED_TAGS as string[]).includes(t)) ?? "";
  return { custom, fixed };
}

/**
 * Build the persisted tag array from the editor state. Order is fixed:
 * custom first, fixed last. Both are optional; empty strings are dropped.
 */
export function joinTags(custom: string, fixed: FixedTag | ""): string[] {
  const out: string[] = [];
  const c = custom.trim();
  if (c) out.push(c);
  if (fixed) out.push(fixed);
  return out;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Built-in provider presets. Users can add their own via ProviderManager. */
export const BUILTIN_PROVIDERS: Omit<ProviderTemplate, "id">[] = [
  {
    name: "OpenAI",
    base_url: "https://api.openai.com/v1",
    docs_url: "https://platform.openai.com/docs",
    console_url: "https://platform.openai.com/api-keys",
  },
  {
    name: "Anthropic",
    base_url: "https://api.anthropic.com/v1",
    docs_url: "https://docs.claude.com",
    console_url: "https://console.anthropic.com/settings/keys",
  },
  {
    name: "DeepSeek",
    base_url: "https://api.deepseek.com/v1",
    docs_url: "https://api-docs.deepseek.com",
    console_url: "https://platform.deepseek.com/api_keys",
  },
  {
    name: "月之暗面 Kimi",
    base_url: "https://api.moonshot.cn/v1",
    docs_url: "https://platform.moonshot.cn/docs",
    console_url: "https://platform.moonshot.cn/console/api-keys",
  },
  {
    name: "智谱 GLM",
    base_url: "https://open.bigmodel.cn/api/paas/v4",
    docs_url: "https://docs.bigmodel.cn",
    console_url: "https://open.bigmodel.cn/usercenter/apikeys",
  },
  {
    name: "阿里百炼",
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    docs_url: "https://help.aliyun.com/zh/model-studio",
    console_url: "https://bailian.console.aliyun.com/?apiKey=1",
  },
  {
    name: "火山方舟",
    base_url: "https://ark.cn-beijing.volces.com/api/v3",
    docs_url: "https://www.volcengine.com/docs/82379",
    console_url: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
  },
  {
    name: "Google Gemini",
    base_url: "https://generativelanguage.googleapis.com/v1beta",
    docs_url: "https://ai.google.dev/gemini-api/docs",
    console_url: "https://aistudio.google.com/apikey",
  },
  {
    name: "OpenRouter",
    base_url: "https://openrouter.ai/api/v1",
    docs_url: "https://openrouter.ai/docs",
    console_url: "https://openrouter.ai/keys",
  },
  {
    name: "Groq",
    base_url: "https://api.groq.com/openai/v1",
    docs_url: "https://console.groq.com/docs",
    console_url: "https://console.groq.com/keys",
  },
  {
    name: "Mistral",
    base_url: "https://api.mistral.ai/v1",
    docs_url: "https://docs.mistral.ai",
    console_url: "https://console.mistral.ai/api-keys",
  },
  {
    name: "xAI",
    base_url: "https://api.x.ai/v1",
    docs_url: "https://docs.x.ai",
    console_url: "https://console.x.ai",
  },
];

/** Builtins first, then user templates, for the provider picker. */
export function providerOptions(custom: ProviderTemplate[]): ProviderOption[] {
  return [
    ...BUILTIN_PROVIDERS.map((p) => ({ ...p, id: null, builtin: true })),
    ...custom.map((p) => ({ ...p, builtin: false })),
  ];
}
