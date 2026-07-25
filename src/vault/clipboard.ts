import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";

const SECRET_TTL_MS = 10_000;

export const SECRET_TTL_SECONDS = SECRET_TTL_MS / 1000;

let pendingClear: ReturnType<typeof setTimeout> | null = null;

/** Copy non-sensitive text. Never auto-cleared. */
export async function copyText(text: string): Promise<void> {
  await writeText(text);
}

/**
 * Copy a secret and wipe it 10 seconds later — but only if the clipboard still
 * holds that same secret, so we never clobber something the user copied since.
 */
export async function copySecret(secret: string): Promise<void> {
  await writeText(secret);
  if (pendingClear) clearTimeout(pendingClear);
  pendingClear = setTimeout(async () => {
    pendingClear = null;
    try {
      if ((await readText()) === secret) await writeText("");
    } catch {
      // Clipboard unreadable (empty or non-text) — nothing of ours to clear.
    }
  }, SECRET_TTL_MS);
}
