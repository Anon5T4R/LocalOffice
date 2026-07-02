import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

/**
 * Subscribe to a Tauri event for the component's lifetime.
 *
 * `listen()` resolves asynchronously, so an effect that unmounts before it
 * resolves must still unlisten once it does, or the listener leaks — the
 * norm under React StrictMode's double-invoked effects in dev. Every caller
 * in this app used to hand-roll that `cancelled` + deferred-unlisten dance;
 * it lives here once now.
 */
export function useTauriEvent<T>(event: string, handler: (payload: T) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    listen<T>(event, (e) => handlerRef.current(e.payload)).then((un) => {
      if (cancelled) {
        un();
        return;
      }
      unlisten = un;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [event]);
}
