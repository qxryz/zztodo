import { useCallback, useEffect, useState } from "react";

const KEY = "zztodo-key-col-widths";

/**
 * The named columns of the Key list, in display order. Widths are kept in this
 * order on the row's CSS grid, and the resize strip uses the same labels to
 * know which column a drag handle belongs to.
 */
export const COL_KEYS = [
  "entry",
  "projects",
  "tags",
  "env",
  "model",
  "actions",
  "updated",
] as const;
export type ColKey = (typeof COL_KEYS)[number];

/** Pixel defaults — sized to roughly match the v0.1.7 fixed-width layout. */
export const DEFAULT_COL_WIDTHS: Record<ColKey, number> = {
  entry: 220,
  projects: 120,
  tags: 110,
  env: 132,
  model: 130,
  actions: 84,
  updated: 78,
};

/** No column can be shrunk past this — anything smaller clips content badly. */
const MIN_COL_WIDTH = 40;

function sanitise(raw: unknown): Record<ColKey, number> {
  const next = { ...DEFAULT_COL_WIDTHS };
  if (raw && typeof raw === "object") {
    for (const k of COL_KEYS) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= MIN_COL_WIDTH) {
        next[k] = Math.round(v);
      }
    }
  }
  return next;
}

export function useKeyColumnWidths() {
  const [widths, setWidths] = useState<Record<ColKey, number>>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return sanitise(raw ? JSON.parse(raw) : null);
    } catch {
      return { ...DEFAULT_COL_WIDTHS };
    }
  });

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(widths));
  }, [widths]);

  const setWidth = useCallback((key: ColKey, value: number) => {
    const next = Math.max(MIN_COL_WIDTH, Math.round(value));
    setWidths((w) => (w[key] === next ? w : { ...w, [key]: next }));
  }, []);

  const reset = useCallback(() => {
    setWidths({ ...DEFAULT_COL_WIDTHS });
  }, []);

  return { widths, setWidth, reset };
}
