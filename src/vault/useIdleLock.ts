import { useEffect, useRef } from "react";

const EVENTS = ["mousedown", "keydown", "wheel", "touchstart"] as const;

/**
 * Calls onIdle after `minutes` without user interaction. minutes = 0 disables.
 * Only armed while `active` is true (i.e. the vault is unlocked).
 */
export function useIdleLock(minutes: number, active: boolean, onIdle: () => void) {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!active || minutes <= 0) return;
    const ms = minutes * 60_000;
    let timer = setTimeout(() => onIdleRef.current(), ms);

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onIdleRef.current(), ms);
    };
    EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));

    return () => {
      clearTimeout(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes, active]);
}
