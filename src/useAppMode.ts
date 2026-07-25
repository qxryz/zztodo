import { useEffect, useState } from "react";
import type { AppMode } from "./types";

const KEY = "zztodo-mode";

export function useAppMode() {
  const [mode, setMode] = useState<AppMode>(
    () => (localStorage.getItem(KEY) as AppMode) || "projects"
  );

  useEffect(() => {
    localStorage.setItem(KEY, mode);
  }, [mode]);

  return { mode, setMode };
}
