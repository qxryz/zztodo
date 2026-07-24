import { useEffect, useState } from "react";
import type { Layout } from "./types";

const KEY = "zztodo-layout";

export function useLayout() {
  const [layout, setLayout] = useState<Layout>(
    () => (localStorage.getItem(KEY) as Layout) || "grid"
  );

  useEffect(() => {
    localStorage.setItem(KEY, layout);
  }, [layout]);

  return { layout, setLayout };
}
