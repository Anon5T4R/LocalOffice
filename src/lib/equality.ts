/**
 * Cheap structural equality for useEditorState selectors. The selectors here
 * return flat objects / lists of flat objects, so one level of comparison is
 * exact — without serializing the result on every editor transaction like the
 * old `JSON.stringify(a) === JSON.stringify(b)` did.
 */

/** Shallow equality: same reference, or plain objects with Object.is-equal values. */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
  );
}

/** Equality for selector results shaped as lists of flat objects. */
export function arrayOfObjectsEqual<T>(a: readonly T[], b: readonly T[] | null | undefined): boolean {
  if (!b) return false;
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((item, i) => shallowEqual(item, b[i]));
}
