import { useCallback, useEffect, type RefObject } from "react";
import type { Settings } from "../lib/settings";

/**
 * Zoom actions (50–200%) persisted in settings, plus Ctrl+scroll on the
 * editor scroll container (native listener so preventDefault isn't passive).
 */
export function useZoom(
  scrollRef: RefObject<HTMLDivElement | null>,
  updateSettings: (patch: Partial<Settings>) => void,
  settingsRef: RefObject<Settings>
) {
  const setZoomAbs = useCallback(
    (z: number) => updateSettings({ zoom: Math.min(200, Math.max(50, Math.round(z))) }),
    [updateSettings]
  );

  // settingsRef is always current, so a relative step (+/-10) never goes
  // stale even though this callback's identity is stable.
  const adjustZoom = useCallback(
    (delta: number) => setZoomAbs((settingsRef.current.zoom || 100) + delta),
    [setZoomAbs, settingsRef]
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      adjustZoom(e.deltaY < 0 ? 10 : -10);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scrollRef, adjustZoom]);

  return { setZoomAbs, adjustZoom };
}
