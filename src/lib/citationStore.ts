import { invoke } from "@tauri-apps/api/core";
import type { CiteEngine, CitationData, CslItem } from "./citations";

/**
 * App-wide citation state. Deliberately tiny and synchronous: NodeViews and
 * the print pipeline read from it without pulling in citeproc — the heavy
 * engine module is lazy-imported only when a bibliography is configured.
 *
 * Subscribers follow the useSyncExternalStore contract (subscribe + version).
 */

interface CitationState {
  engine: CiteEngine | null;
  items: CslItem[];
  error: string;
  loading: boolean;
}

let state: CitationState = { engine: null, items: [], error: "", loading: false };
let version = 0;
const listeners = new Set<() => void>();

function emit(patch: Partial<CitationState>): void {
  state = { ...state, ...patch };
  version++;
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getVersion = (): number => version;
export const getEngine = (): CiteEngine | null => state.engine;
export const getItems = (): CslItem[] => state.items;
export const getError = (): string => state.error;
export const isLoading = (): boolean => state.loading;

/**
 * Author names + year, for the autocomplete list. Lives here (not in
 * citations.ts) so the editor UI never drags citeproc into the main bundle.
 */
export function itemSummary(item: CslItem): { authors: string; year: string } {
  const names = (item.author ?? [])
    .map((a) => a.family || a.literal || a.given || "")
    .filter(Boolean);
  const authors =
    names.length === 0 ? "(sem autor)" : names.length > 2 ? `${names[0]} et al.` : names.join(" & ");
  const year = String(item.issued?.["date-parts"]?.[0]?.[0] ?? "s.d.");
  return { authors, year };
}

/** Build an engine from already-parsed CSL-JSON items (also used by tests). */
export async function configureWithItems(
  items: CslItem[],
  styleId: string,
  customStyleXml?: string
): Promise<void> {
  const { CiteEngine, CSL_STYLES } = await import("./citations");
  const xml = customStyleXml ?? (CSL_STYLES[styleId] ?? CSL_STYLES.abnt).xml;
  emit({ engine: new CiteEngine(items, xml), items, error: "", loading: false });
}

/**
 * Load a bibliography file (.json = CSL-JSON read directly; anything else is
 * converted from BibTeX/BibLaTeX by the pandoc sidecar) and build the engine.
 */
export async function configure(
  bibPath: string,
  styleId: string,
  customCslPath?: string
): Promise<void> {
  if (!bibPath.trim()) {
    emit({ engine: null, items: [], error: "", loading: false });
    return;
  }
  emit({ loading: true });
  try {
    const raw = bibPath.toLowerCase().endsWith(".json")
      ? await invoke<string>("read_text_file", { path: bibPath })
      : await invoke<string>("import_bibliography", { path: bibPath });
    const items = JSON.parse(raw) as CslItem[];
    const customXml =
      styleId === "custom" && customCslPath
        ? await invoke<string>("read_text_file", { path: customCslPath })
        : undefined;
    await configureWithItems(items, styleId, customXml);
  } catch (e) {
    emit({ engine: null, items: [], error: String(e), loading: false });
  }
}

/** Register the keys cited by the document, in document order. */
export function setCited(keys: string[]): void {
  // Only notify when the registry actually changed — subscribers include the
  // collector that calls this function, so unconditional emits would loop.
  if (state.engine?.setCited(keys)) {
    version++;
    listeners.forEach((fn) => fn());
  }
}

/** Format one citation cluster, or null when nothing resolves. */
export function formatCitation(data: CitationData): string | null {
  return state.engine?.formatCitation(data) ?? null;
}

// ---------------------------------------------------------------------------
// Export baking (shared by the print pipeline and DOCX/ODT export)
// ---------------------------------------------------------------------------

/** Read a citation node's data attributes back into CitationData. */
export function citationDataFromEl(el: Element): CitationData {
  return {
    keys: (el.getAttribute("data-keys") ?? "").split(",").filter(Boolean),
    locator: el.getAttribute("data-locator") ?? "",
    prefix: el.getAttribute("data-prefix") ?? "",
    suppressAuthor: el.getAttribute("data-suppress-author") === "true",
  };
}

/** Fallback text when no bibliography is loaded: pandoc-style [@a; @b]. */
export function rawCitationText(data: CitationData): string {
  return `[${data.keys.map((k) => `@${k}`).join("; ")}]`;
}

/**
 * Replace citation spans with formatted text and the bibliography marker with
 * the formatted reference list, inside a parsed document. No-op pieces stay
 * as-is when no engine is loaded (citations fall back to [@key]).
 */
export function bakeCitationsInto(doc: Document): void {
  // Self-contained: register the cited keys from the very DOM being baked, so
  // the bibliography is correct even if the editor's collector hasn't run yet.
  const cited: string[] = [];
  doc.querySelectorAll("span[data-citation]").forEach((el) => {
    citationDataFromEl(el).keys.forEach((k) => cited.push(k));
  });
  state.engine?.setCited(cited);

  doc.querySelectorAll("span[data-citation]").forEach((el) => {
    const data = citationDataFromEl(el);
    el.replaceWith(doc.createTextNode(formatCitation(data) ?? rawCitationText(data)));
  });
  doc.querySelectorAll("div[data-bibliography]").forEach((el) => {
    const entries = state.engine?.formatBibliography() ?? [];
    const wrap = doc.createElement("section");
    wrap.className = "bibliography";
    const h = doc.createElement("h2");
    h.textContent = "Referências";
    wrap.appendChild(h);
    wrap.insertAdjacentHTML("beforeend", entries.join("\n"));
    el.replaceWith(wrap);
  });
}

/** String-in/string-out version of `bakeCitationsInto` for export paths. */
export function bakeCitationsHtml(html: string): string {
  if (!html.includes("data-citation") && !html.includes("data-bibliography")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  bakeCitationsInto(doc);
  return doc.body.innerHTML;
}
