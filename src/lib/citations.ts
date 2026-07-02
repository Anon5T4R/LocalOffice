import CSL from "citeproc";
import abnt from "../assets/csl/associacao-brasileira-de-normas-tecnicas.csl?raw";
import apa from "../assets/csl/apa.csl?raw";
import chicago from "../assets/csl/chicago-author-date.csl?raw";
import ieee from "../assets/csl/ieee.csl?raw";
import localePtBr from "../assets/csl/locales-pt-BR.xml?raw";
import localeEnUs from "../assets/csl/locales-en-US.xml?raw";

/**
 * CSL citation engine (citeproc-js + bundled styles/locales, 100% offline).
 * Heavy module (~1MB): always load through `import()` — the citation store is
 * the only intended consumer.
 */

/** One reference in CSL-JSON form (as produced by Zotero/pandoc). */
export interface CslItem {
  id: string | number;
  type?: string;
  title?: string;
  author?: { family?: string; given?: string; literal?: string }[];
  issued?: { "date-parts"?: number[][] };
  [key: string]: unknown;
}

/** Attributes of one citation cluster in the document. */
export interface CitationData {
  keys: string[];
  locator: string;
  prefix: string;
  suppressAuthor: boolean;
}

export const CSL_STYLES: Record<string, { name: string; xml: string }> = {
  abnt: { name: "ABNT (autor-data)", xml: abnt },
  apa: { name: "APA 7ª ed.", xml: apa },
  chicago: { name: "Chicago (autor-data)", xml: chicago },
  ieee: { name: "IEEE (numérico)", xml: ieee },
};

const LOCALES: Record<string, string> = {
  "pt-BR": localePtBr,
  "en-US": localeEnUs,
};

export class CiteEngine {
  private engine: {
    updateItems(ids: string[]): void;
    makeCitationCluster(cites: unknown[]): string;
    makeBibliography(): [unknown, string[]] | false;
  };
  private itemsById: Map<string, CslItem>;
  private citedIds: string[] = [];

  constructor(items: CslItem[], styleXml: string, locale = "pt-BR") {
    this.itemsById = new Map(items.map((i) => [String(i.id), i]));
    const sys = {
      retrieveLocale: (lang: string) => LOCALES[lang] || LOCALES["en-US"],
      retrieveItem: (id: string) => this.itemsById.get(String(id)),
    };
    this.engine = new CSL.Engine(sys, styleXml, locale);
  }

  has(id: string): boolean {
    return this.itemsById.has(id);
  }

  get items(): CslItem[] {
    return [...this.itemsById.values()];
  }

  /**
   * Register which keys the document cites, in document order. Numeric styles
   * (IEEE) take their numbers from this registry, so it must be kept current.
   */
  setCited(keys: string[]): boolean {
    const ids = [...new Set(keys)].filter((k) => this.has(k));
    const same = ids.length === this.citedIds.length && ids.every((v, i) => v === this.citedIds[i]);
    if (same) return false;
    this.citedIds = ids;
    this.engine.updateItems(ids);
    return true;
  }

  /** e.g. "(SILVA, 2020, p. 45)" — or null when no key resolves. */
  formatCitation(data: CitationData): string | null {
    const known = data.keys.filter((k) => this.has(k));
    if (known.length === 0) return null;
    const cites = known.map((id, i) => ({
      id,
      locator: i === known.length - 1 && data.locator ? data.locator : undefined,
      label: i === known.length - 1 && data.locator ? "page" : undefined,
      prefix: i === 0 && data.prefix ? `${data.prefix} ` : undefined,
      "suppress-author": data.suppressAuthor || undefined,
    }));
    try {
      return this.engine.makeCitationCluster(cites);
    } catch (e) {
      console.error("citeproc:", e);
      return null;
    }
  }

  /** Formatted bibliography (HTML strings) for the currently cited keys. */
  formatBibliography(): string[] {
    if (this.citedIds.length === 0) return [];
    try {
      const result = this.engine.makeBibliography();
      return result ? result[1] : [];
    } catch (e) {
      console.error("citeproc bibliography:", e);
      return [];
    }
  }
}
