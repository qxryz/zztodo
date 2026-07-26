import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { vaultApi } from "./api";
import type { VaultStatus } from "./types";

/**
 * Owns vault status at app level so the idle-lock timer keeps running even
 * while the user is on the projects page (switching pages must not unlock
 * forever, but must also not lock immediately).
 */
export function useVault() {
  const [status, setStatus] = useState<VaultStatus | null>(null);

  const refresh = useCallback(async () => {
    setStatus(await vaultApi.status());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Menu-bar "锁定 Key 库" locks on the Rust side; mirror that into React state.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("tray://vault-locked", () => {
      refresh();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [refresh]);

  const lock = useCallback(async () => {
    await vaultApi.lock();
    await refresh();
  }, [refresh]);

  return {
    status,
    /** Apply a status returned by create/unlock without a extra round-trip. */
    setStatus,
    refresh,
    lock,
    unlocked: status?.state === "unlocked",
  };
}
