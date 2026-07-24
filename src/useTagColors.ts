import { useEffect, useState } from "react";
import { TAG_META, TagKey } from "./types";

export type TagColors = Record<TagKey, string>;

const KEY = "zztodo-tag-colors";
const PALETTES_KEY = "zztodo-tag-palettes";
const MAX_PALETTES = 3;

function defaultColors(): TagColors {
  const out = {} as TagColors;
  (Object.keys(TAG_META) as TagKey[]).forEach((k) => {
    out[k] = TAG_META[k].defaultColor;
  });
  return out;
}

function readColors(): TagColors {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultColors();
    return { ...defaultColors(), ...JSON.parse(raw) };
  } catch {
    return defaultColors();
  }
}

function readPalettes(): TagColors[] {
  try {
    const raw = localStorage.getItem(PALETTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_PALETTES) : [];
  } catch {
    return [];
  }
}

function randomHex(): string {
  const n = Math.floor(Math.random() * 0xffffff);
  return `#${n.toString(16).padStart(6, "0")}`;
}

export function useTagColors() {
  const [colors, setColors] = useState<TagColors>(readColors);
  const [palettes, setPalettes] = useState<TagColors[]>(readPalettes);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(colors));
  }, [colors]);

  useEffect(() => {
    localStorage.setItem(PALETTES_KEY, JSON.stringify(palettes));
  }, [palettes]);

  const setColor = (key: TagKey, color: string) =>
    setColors((c) => ({ ...c, [key]: color }));

  const randomize = () => {
    const next = {} as TagColors;
    (Object.keys(TAG_META) as TagKey[]).forEach((k) => {
      next[k] = randomHex();
    });
    setColors(next);
  };

  const saveToSlot = (slot: number) => {
    setPalettes((prev) => {
      const next = [...prev];
      while (next.length <= slot) next.push(defaultColors());
      next[slot] = colors;
      return next.slice(0, MAX_PALETTES);
    });
  };

  const loadFromSlot = (slot: number) => {
    const p = palettes[slot];
    if (p) setColors(p);
  };

  return { colors, setColor, randomize, palettes, saveToSlot, loadFromSlot, maxPalettes: MAX_PALETTES };
}
