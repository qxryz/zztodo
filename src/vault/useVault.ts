import { useCallback, useEffect, useState } from "react";
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
