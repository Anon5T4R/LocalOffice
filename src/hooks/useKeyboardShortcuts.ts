import { useEffect } from "react";
import { useLatest } from "./useLatest";

export interface ShortcutHandlers {
  save: () => void;
  saveAs: () => void;
  open: () => void;
  newTab: () => void;
  closeActiveTab: () => void;
  openSearch: () => void;
  toggleFocusMode: () => void;
  exitFocusMode: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
}

/**
 * Global keyboard shortcuts. Handlers go through a latest-ref, so the window
 * listener is registered exactly once and never re-bound on re-renders.
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  const ref = useLatest(handlers);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = ref.current;
      if (e.key === "F11") {
        e.preventDefault();
        h.toggleFocusMode();
        return;
      }
      if (e.key === "Escape") h.exitFocusMode();
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      const action =
        k === "s" && e.shiftKey ? h.saveAs
        : k === "s" ? h.save
        : k === "o" ? h.open
        : k === "n" || k === "t" ? h.newTab
        : k === "f" && !e.altKey ? h.openSearch
        : k === "w" ? h.closeActiveTab
        : k === "=" || k === "+" ? h.zoomIn
        : k === "-" || k === "_" ? h.zoomOut
        : k === "0" ? h.zoomReset
        : null;
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
