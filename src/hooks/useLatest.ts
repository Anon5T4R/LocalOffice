import { useRef, type RefObject } from "react";

/**
 * A ref that always holds the latest render's value. Lets a stable callback
 * (created once, e.g. for a native event listener or captured by the editor
 * at creation) read current props/state without needing to be recreated —
 * every hook in this app that needed "the freshest X" hand-rolled this same
 * `useRef` + reassign-on-render pair.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
