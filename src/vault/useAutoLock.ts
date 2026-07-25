import { useEffect, useState } from "react";

const KEY = "zztodo-vault-autolock";
const DEFAULT_MINUTES = 5;

export const AUTOLOCK_OPTIONS = [
  { value: 1, label: "1 分钟" },
  { value: 5, label: "5 分钟" },
  { value: 15, label: "15 分钟" },
  { value: 30, label: "30 分钟" },
  { value: 0, label: "从不" },
];

export function useAutoLock() {
  const [minutes, setMinutes] = useState<number>(() => {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return DEFAULT_MINUTES;
    const n = Number(raw);
    return AUTOLOCK_OPTIONS.some((o) => o.value === n) ? n : DEFAULT_MINUTES;
  });

  useEffect(() => {
    localStorage.setItem(KEY, String(minutes));
  }, [minutes]);

  return { minutes, setMinutes };
}
