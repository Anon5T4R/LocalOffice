import { useCallback, useEffect, type RefObject } from "react";
import { loadSettings, type Settings } from "../lib/settings";

/**
 * Zoom actions (50–200%) persisted in settings, plus Ctrl+scroll on the
 * editor scroll container (native listener so preventDefault isn't passive).
 */
export function useZoom(
  scrollRef: RefObject<HTMLDivElement | null>,
  updateSettings: (patch: Partial<Settings>) => void
) {
  const setZoomAbs = useCallback(
    (z: number) => updateSettings({ zoom: Math.min(200, Math.max(50, Math.round(z))) }),
    [updateSettings]
  );

  // Read the freshest value from storage so keyboard/wheel steps never go stale.
  const adjustZoom = useCallback(
    (delta: number) => setZoomAbs((loadSettings().zoom || 100) + delta),
    [setZoomAbs]
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
