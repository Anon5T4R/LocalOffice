declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";
  export const gfm: TurndownService.Plugin;
  export const tables: TurndownService.Plugin;
  export const strikethrough: TurndownService.Plugin;
  export const taskListItems: TurndownService.Plugin;
}

declare module "citeproc" {
  /** citeproc-js: CSL engine. Loosely typed — we wrap it in lib/citations.ts. */
  const CSL: {
    Engine: new (
      sys: {
        retrieveLocale: (lang: string) => string | undefined;
        retrieveItem: (id: string) => unknown;
      },
      styleXml: string,
      locale?: string
    ) => {
      updateItems(ids: string[]): void;
      makeCitationCluster(cites: unknown[]): string;
      makeBibliography(): [unknown, string[]] | false;
    };
  };
  export default CSL;
}

declare module "pagedjs" {
  /** CSS Paged Media polyfill. Renders `content` into real page boxes inside `renderTo`. */
  export class Previewer {
    preview(
      content: Node | string,
      stylesheets: string[],
      renderTo: HTMLElement
    ): Promise<{ total: number }>;
    /** Event emitter: re-emits the chunker's "page" per rendered page, plus "rendering"/"rendered". */
    on(event: "page" | "rendering" | "rendered", handler: (payload: unknown) => void): void;
  }

  /** Base class for chunker/polisher hooks (filter, afterParsed, …). Loosely
   *  typed — we only implement `filter` (see pdf.ts registerUndisplayedFix). */
  export class Handler {
    constructor(...args: unknown[]);
    filter?(content: DocumentFragment): void;
  }

  /** Adds handlers (globally) to every Previewer created afterwards. */
  export function registerHandlers(...handlers: (typeof Handler)[]): void;
}
