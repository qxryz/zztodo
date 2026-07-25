import { useCallback, useEffect, useState } from "react";

/**
 * 粘性标记 (sticky marker): a toolbar button in the zzkey list whose tint
 * cycles on each click; entries created while a color is active are stored
 * with that tint. The cycle always starts at white (the original, unmarked
 * look) followed by 7 user-reorderable pastel colors.
 */

export type MarkerClickMode = "random" | "sequence" | "toggle";

export const MARKER_COLOR_COUNT = 7;

/** Light pastels only — saturated tints would fight the row text. */
export const DEFAULT_MARKER_COLORS: string[] = [
  "#fff3b0", // 鹅黄
  "#ffd6e0", // 浅粉
  "#ffd9b3", // 浅橙
  "#d8f5d0", // 浅绿
  "#d0e9ff", // 浅蓝
  "#e8dcff", // 浅紫
  "#d9f2ef", // 浅青
];

export const MARKER_CLICK_MODES: { value: MarkerClickMode; label: string }[] = [
  { value: "random", label: "随机切换" },
  { value: "sequence", label: "按顺序切换" },
  { value: "toggle", label: "白 / 首色互切" },
];

const KEY = "zztodo-sticky-marker";
/** Slot count in the cycle: white + the 7 colors. */
const SLOT_COUNT = MARKER_COLOR_COUNT + 1;

interface MarkerPrefs {
  enabled: boolean;
  clickMode: MarkerClickMode;
  colors: string[];
  /** 0 = white (unmarked); 1..7 index into colors[]. */
  activeIndex: number;
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

function sanitise(raw: unknown): MarkerPrefs {
  const fallback: MarkerPrefs = {
    enabled: true,
    clickMode: "sequence",
    colors: [...DEFAULT_MARKER_COLORS],
    activeIndex: 0,
  };
  if (!raw || typeof raw !== "object") return fallback;
  const p = raw as Partial<MarkerPrefs>;

  const colors = [...DEFAULT_MARKER_COLORS];
  if (Array.isArray(p.colors)) {
    p.colors.forEach((c, i) => {
      if (i < MARKER_COLOR_COUNT && typeof c === "string" && HEX_RE.test(c)) {
        colors[i] = c.toLowerCase();
      }
    });
  }

  const mode: MarkerClickMode =
    p.clickMode === "random" || p.clickMode === "toggle" ? p.clickMode : "sequence";

  let activeIndex = typeof p.activeIndex === "number" ? Math.round(p.activeIndex) : 0;
  if (activeIndex < 0 || activeIndex >= SLOT_COUNT) activeIndex = 0;

  return {
    enabled: p.enabled !== false,
    clickMode: mode,
    colors,
    activeIndex,
  };
}

function read(): MarkerPrefs {
  try {
    return sanitise(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return sanitise(null);
  }
}

export function useStickyMarker() {
  const [prefs, setPrefs] = useState<MarkerPrefs>(read);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  }, [prefs]);

  /** Advance the button tint per the configured click behaviour. */
  const advance = useCallback(() => {
    setPrefs((p) => {
      let next: number;
      if (p.clickMode === "toggle") {
        // Only ever white ↔ the first color in the sequence.
        next = p.activeIndex === 1 ? 0 : 1;
      } else if (p.clickMode === "random") {
        // Any slot except the current one, so a click always changes something.
        do {
          next = Math.floor(Math.random() * SLOT_COUNT);
        } while (next === p.activeIndex);
      } else {
        next = (p.activeIndex + 1) % SLOT_COUNT;
      }
      return { ...p, activeIndex: next };
    });
  }, []);

  /** "" when the white (unmarked) slot is active, else the active hex. */
  const currentColor = prefs.activeIndex === 0 ? "" : prefs.colors[prefs.activeIndex - 1];

  const setEnabled = useCallback(
    (enabled: boolean) => setPrefs((p) => ({ ...p, enabled })),
    [],
  );

  const setClickMode = useCallback(
    (clickMode: MarkerClickMode) => setPrefs((p) => ({ ...p, clickMode })),
    [],
  );

  /** Drag-reorder: move colors[from] to position `to` (white stays put at slot 0). */
  const moveColor = useCallback((from: number, to: number) => {
    setPrefs((p) => {
      if (
        from === to ||
        from < 0 ||
        to < 0 ||
        from >= MARKER_COLOR_COUNT ||
        to >= MARKER_COLOR_COUNT
      ) {
        return p;
      }
      const colors = [...p.colors];
      const [c] = colors.splice(from, 1);
      colors.splice(to, 0, c);
      // Keep the active tint attached to its color rather than its old slot.
      const activeHex = p.activeIndex === 0 ? null : p.colors[p.activeIndex - 1];
      const activeIndex = activeHex === null ? 0 : colors.indexOf(activeHex) + 1;
      return { ...p, colors, activeIndex };
    });
  }, []);

  /** Replace the whole 7-color sequence (used by live drag commit). */
  const setColorOrder = useCallback((next: string[]) => {
    setPrefs((p) => {
      if (next.length !== MARKER_COLOR_COUNT) return p;
      const colors = next.map((c, i) =>
        typeof c === "string" && HEX_RE.test(c) ? c.toLowerCase() : p.colors[i],
      );
      const activeHex = p.activeIndex === 0 ? null : p.colors[p.activeIndex - 1];
      const idx = activeHex === null ? -1 : colors.indexOf(activeHex);
      return { ...p, colors, activeIndex: idx < 0 ? 0 : idx + 1 };
    });
  }, []);

  const resetColors = useCallback(
    () =>
      setPrefs((p) => ({
        ...p,
        colors: [...DEFAULT_MARKER_COLORS],
        activeIndex: 0,
      })),
    [],
  );

  return {
    enabled: prefs.enabled,
    clickMode: prefs.clickMode,
    colors: prefs.colors,
    activeIndex: prefs.activeIndex,
    currentColor,
    advance,
    setEnabled,
    setClickMode,
    moveColor,
    setColorOrder,
    resetColors,
  };
}

export type StickyMarker = ReturnType<typeof useStickyMarker>;
