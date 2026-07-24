import { useEffect, useState } from "react";
import type { FontScale } from "./types";

const KEY = "zztodo-font-scale";
const SCALE: Record<FontScale, number> = { sm: 0.92, md: 1, lg: 1.12 };

export function useFontScale() {
  const [fontScale, setFontScale] = useState<FontScale>(
    () => (localStorage.getItem(KEY) as FontScale) || "md"
  );

  useEffect(() => {
    localStorage.setItem(KEY, fontScale);
    document.documentElement.style.setProperty("--fs", String(SCALE[fontScale]));
  }, [fontScale]);

  return { fontScale, setFontScale };
}
