import { useEffect } from "react";
import type { Editor } from "@tiptap/react";
import * as citationStore from "../lib/citationStore";
import type { Settings } from "../lib/settings";

type CitationSettings = Pick<Settings, "bibPath" | "cslStyle" | "customCslPath">;

/**
 * Keeps the citation engine wired to the document:
 * - (re)loads the bibliography when its settings change, and again on window
 *   focus (throttled) so edits made in Zotero show up when you return;
 * - keeps the engine's cited-keys registry in document order (numeric styles
 *   like IEEE derive citation numbers from it), debounced so typing stays cheap.
 */
export function useCitationRegistry(editor: Editor | null, settings: CitationSettings): void {
  useEffect(() => {
    citationStore.configure(settings.bibPath || "", settings.cslStyle || "abnt", settings.customCslPath);
    let lastLoad = Date.now();
    const onFocus = () => {
      if (!settings.bibPath || Date.now() - lastLoad < 10_000) return;
      lastLoad = Date.now();
      citationStore.configure(settings.bibPath, settings.cslStyle || "abnt", settings.customCslPath);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [settings.bibPath, settings.cslStyle, settings.customCslPath]);

  useEffect(() => {
    if (!editor) return;
    let timer: number | null = null;
    const collect = () => {
      timer = null;
      const keys: string[] = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name === "citation") {
          String(node.attrs.keys ?? "").split(",").filter(Boolean).forEach((k) => keys.push(k));
        }
      });
      citationStore.setCited(keys);
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(collect, 400);
    };
    collect();
    editor.on("update", schedule);
    // Re-collect when the bibliography (re)loads: setCited was a no-op before.
    const unsubscribe = citationStore.subscribe(schedule);
    return () => {
      editor.off("update", schedule);
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [editor]);
}
