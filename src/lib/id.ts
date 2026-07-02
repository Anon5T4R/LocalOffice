/**
 * Single ID generator for the app. `crypto.randomUUID` is always available in
 * the Tauri WebViews (WebView2/WebKitGTK are secure contexts). 12 hex-ish
 * chars of a UUID are far beyond any collision risk here; prefixes are kept
 * because ids persist inside saved documents (fn-/c-) and code filters by them.
 */
export function newId(prefix = ""): string {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}
