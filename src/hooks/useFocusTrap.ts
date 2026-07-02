import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface UseFocusTrapOptions {
  active?: boolean;
  /** Called on Escape — every dialog in the app wants this, so it lives here
   *  once instead of each caller re-adding its own window keydown listener. */
  onEscape?: () => void;
}

/**
 * Keep keyboard focus inside `ref` while `active`: focuses the first focusable
 * element on mount, cycles Tab/Shift+Tab at the edges, and restores focus to
 * the previously focused element on unmount.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, opts: UseFocusTrapOptions = {}): void {
  const { active = true, onEscape } = opts;

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;
    const previous = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        // offsetParent === null filters display:none elements (but not the
        // currently focused one, which must stay eligible as an edge).
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    (focusables()[0] ?? container).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = focusables();
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !container.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !container.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };
    container.addEventListener("keydown", onKey);
    return () => {
      container.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [ref, active]);

  // Window-level (not container-level) so Escape works the instant the
  // dialog mounts, matching the behavior every caller had before this was
  // centralized here.
  useEffect(() => {
    if (!active || !onEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onEscape]);
}
