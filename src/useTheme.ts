import { useEffect, useState } from "react";
import type { Theme } from "./types";

const KEY = "zztodo-theme";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(KEY) as Theme) || "system"
  );

  useEffect(() => {
    localStorage.setItem(KEY, theme);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved =
        theme === "system" ? (mq.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    if (theme === "system") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

  return { theme, setTheme };
}
