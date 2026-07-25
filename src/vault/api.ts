import { invoke } from "@tauri-apps/api/core";
import type {
  AttachmentMeta,
  EntryInput,
  EntryMeta,
  ProviderInput,
  ProviderTemplate,
  VaultStatus,
} from "./types";

export const vaultApi = {
  status: () => invoke<VaultStatus>("vault_status"),
  create: (password: string) => invoke<VaultStatus>("vault_create", { password }),
  unlock: (password: string) => invoke<VaultStatus>("vault_unlock", { password }),
  lock: () => invoke<void>("vault_lock"),
  destroy: () => invoke<VaultStatus>("vault_destroy"),
  changePassword: (old: string, next: string) =>
    invoke<void>("vault_change_password", { old, new: next }),

  listEntries: () => invoke<EntryMeta[]>("vault_list_entries"),
  getSecret: (id: number) => invoke<string>("vault_get_secret", { id }),
  saveEntry: (input: EntryInput) => invoke<EntryMeta>("vault_save_entry", { input }),
  deleteEntry: (id: number) => invoke<void>("vault_delete_entry", { id }),

  addAttachment: (id: number, filePath: string) =>
    invoke<AttachmentMeta[]>("vault_add_attachment", { id, filePath }),
  saveAttachmentTo: (id: number, name: string, destPath: string) =>
    invoke<void>("vault_save_attachment_to", { id, name, destPath }),
  removeAttachment: (id: number, name: string) =>
    invoke<AttachmentMeta[]>("vault_remove_attachment", { id, name }),

  listProviders: () => invoke<ProviderTemplate[]>("vault_list_providers"),
  saveProvider: (input: ProviderInput) =>
    invoke<ProviderTemplate[]>("vault_save_provider", { input }),
  deleteProvider: (id: number) => invoke<ProviderTemplate[]>("vault_delete_provider", { id }),
};
