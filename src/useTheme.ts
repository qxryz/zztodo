import { useEffect, useState } from "react";
import { THEME_META, type Theme } from "./types";

const KEY = "zztodo-theme";

/** Stored value from before new themes existed might be anything; fall back. */
function read(): Theme {
  const raw = localStorage.getItem(KEY) as Theme | null;
  return raw && raw in THEME_META ? raw : "system";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(read);

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
