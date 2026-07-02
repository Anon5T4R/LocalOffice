import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ask, open as openDialog } from "@tauri-apps/plugin-dialog";
import { buildExtensions } from "./editor/extensions";
import { MenuBar } from "./editor/MenuBar";
import { Ribbon } from "./editor/Ribbon";
import { TabStrip } from "./editor/TabStrip";
import { SearchBar } from "./editor/search/SearchBar";
import { ChaptersPanel } from "./editor/ChaptersPanel";
import { ReviewPanel } from "./editor/ReviewPanel";
import { StatusBar } from "./editor/StatusBar";
import { AiPanel } from "./ai/AiPanel";
import { AiBubbleMenu } from "./ai/AiBubbleMenu";
import { useLocalAi } from "./ai/useLocalAi";
import { SettingsModal } from "./SettingsModal";
import { VersionHistory } from "./VersionHistory";
import { pickImageDataUri } from "./lib/images";
import { PrintOptions } from "./lib/pdf";
import { PrintPreview } from "./PrintPreview";
import * as citationStore from "./lib/citationStore";
import { DocTemplate, applyTemplateContent } from "./lib/templates";
import {
  DocFile,
  DocFormat,
  baseName,
  openDocument,
  openDocumentPath,
  saveDocumentAs,
  saveDocumentTo,
} from "./lib/document";
import { Tab, EMPTY_DOC, SaveStatus, newTab, tabTitle } from "./lib/tabs";
import {
  Recent,
  Settings,
  PageFormat,
  PageMargins,
  addRecent,
  applyTheme,
  loadRecents,
  loadSettings,
  saveSettings,
} from "./lib/settings";
import "./App.css";

const PAGE_DIMS: Record<string, { width: string; height: string; pxHeight: number }> = {
  classic: { width: "760px", height: "auto", pxHeight: Infinity },
  a4: { width: "210mm", height: "297mm", pxHeight: 1123 },
  a5: { width: "148mm", height: "210mm", pxHeight: 794 },
  letter: { width: "215.9mm", height: "279.4mm", pxHeight: 1056 },
  a3: { width: "297mm", height: "420mm", pxHeight: 1587 },
};

/**
 * Page boundaries measured from the real block layout: a new page starts at
 * the first block that doesn't fit the current one, or right after a manual
 * page break. Blocks taller than a whole page are sliced at page height
 * (mid-paragraph, like any word processor). Offsets are Y positions in the
 * editor's (zoomed) coordinate space where each new page begins.
 */
function measurePageOffsets(el: HTMLElement, pageH: number): number[] {
  const rect = el.getBoundingClientRect();
  const offsets: number[] = [];
  let pageStart = 0;
  for (const child of Array.from(el.children) as HTMLElement[]) {
    const r = child.getBoundingClientRect();
    const top = r.top - rect.top;
    const bottom = r.bottom - rect.top;

    if (child.hasAttribute("data-page-break")) {
      offsets.push(bottom);
      pageStart = bottom;
      continue;
    }
    if (bottom - pageStart <= pageH) continue;

    // Snap the boundary to the block's start when it fits on the next page.
    if (top > pageStart && bottom - top <= pageH) {
      offsets.push(top);
      pageStart = top;
      continue;
    }
    // Oversized block: slice it at page height.
    if (top > pageStart) {
      offsets.push(top);
      pageStart = top;
    }
    while (bottom - pageStart > pageH) {
      pageStart += pageH;
      offsets.push(pageStart);
    }
  }
  return offsets;
}

function App() {
  const first = useRef<Tab>(newTab());
  const [tabs, setTabs] = useState<Tab[]>(() => [first.current]);
  const [activeId, setActiveId] = useState<string>(first.current.id);

  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [recents, setRecents] = useState<Recent[]>(() => loadRecents());
  const [showSettings, setShowSettings] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [printJob, setPrintJob] = useState<{ html: string; options: PrintOptions } | null>(null);
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  // Each ghost mirrors one printed page: `top` is the content offset where the
  // page starts, `height` the slice it shows (so the next page's first block
  // never peeks at the bottom). Both are in unzoomed content px.
  const [ghostPages, setGhostPages] = useState<{ top: number; height: number }[]>([]);
  const [ghostHtml, setGhostHtml] = useState("");

  const pageFormat = settings.pageFormat || "classic";
  const pageMargins = settings.pageMargins || { top: 56, bottom: 56, left: 72, right: 72 };
  const customFonts = settings.customFonts || [];
  const zoom = settings.zoom || 100;
  const zoomFactor = zoom / 100;

  const dims = PAGE_DIMS[pageFormat] || PAGE_DIMS.classic;
  const isPaginated = pageFormat !== "classic";

  // Refs so timers / editor callbacks always see fresh state.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  useEffect(() => {
    applyTheme(settings.theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load system fonts
  useEffect(() => {
    invoke<string[]>("list_system_fonts")
      .then((fonts) => setSystemFonts(fonts))
      .catch(() => {});
  }, []);

  // Re-register custom fonts on startup
  useEffect(() => {
    if (!customFonts.length) return;
    let cancelled = false;
    (async () => {
      for (const font of customFonts) {
        if (cancelled) break;
        try {
          const info = await invoke<{ name: string; base64: string }>("import_font", { path: font.path });
          const ff = new FontFace(info.name, `url('data:font/ttf;base64,${info.base64}')`);
          await ff.load();
          document.fonts.add(ff);
        } catch { /* skip fonts that can't be loaded */ }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const next = saveSettings(patch);
    setSettings(next);
    if (patch.theme) applyTheme(patch.theme);
  }, []);

  const remember = useCallback((path: string) => setRecents(addRecent(path)), []);

  // Monotonic edit counter per tab: a finished save only clears `dirty` when
  // no edit happened while the write was in flight.
  const editSeq = useRef(new Map<string, number>());

  const markDirty = useCallback(() => {
    const id = activeIdRef.current;
    editSeq.current.set(id, (editSeq.current.get(id) ?? 0) + 1);
    setTabs((ts) => ts.map((t) => (t.id === id && !t.dirty ? { ...t, dirty: true } : t)));
  }, []);

  // Debounced autosave: only writes when you pause typing (zero cost while typing),
  // and never loses more than a couple seconds of work. `scheduleRef` always points
  // to the latest scheduler so the editor's onUpdate can call it.
  const scheduleRef = useRef<() => void>(() => {});
  const autosaveTimer = useRef<number | null>(null);
  const firstDirtyAt = useRef(0);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "idle" });

  // Every disk write of a tab goes through this chain, so two writes to the
  // same file can never interleave (autosave, switch-tab save, manual save).
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());

  const queueSave = useCallback(
    (tab: { id: string; filePath: string; format: DocFormat }, html: string): Promise<void> => {
      const seq = editSeq.current.get(tab.id) ?? 0;
      const job = saveChain.current.then(async () => {
        setSaveStatus({ kind: "saving" });
        try {
          await saveDocumentTo(tab.filePath, html, tab.format);
        } catch (e) {
          setSaveStatus({ kind: "error", message: String(e), at: Date.now() });
          throw e;
        }
        setSaveStatus({ kind: "saved", at: Date.now() });
        if ((editSeq.current.get(tab.id) ?? 0) === seq) {
          setTabs((ts) => ts.map((t) => (t.id === tab.id ? { ...t, dirty: false } : t)));
        }
      });
      saveChain.current = job.catch(() => {}); // a failed save must not block the next one
      return job;
    },
    []
  );

  const cancelAutosave = useCallback(() => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    firstDirtyAt.current = 0;
  }, []);

  const editor = useEditor({
    extensions: buildExtensions(),
    content: first.current.doc,
    autofocus: true,
    onUpdate: () => {
      markDirty();
      scheduleRef.current();
    },
  });

  // Ghost pages: measure page boundaries (manual breaks + overflow) and mirror
  // the content into fixed-size ghost pages. Runs on mount/format change and on
  // content resize, coalesced via rAF — ResizeObserver fires in bursts while
  // typing and editor.getHTML() serializes the whole doc, so once per frame max.
  useEffect(() => {
    if (!editor || !isPaginated) {
      setGhostPages([]);
      setGhostHtml("");
      return;
    }
    const el = editor.view.dom;
    let raf = 0;
    const measure = () => {
      raf = 0;
      // A page only fits its *printable* height — the page minus its margins,
      // not the whole sheet. Measuring against the full sheet is what dropped
      // a margin's worth of content at every page seam.
      const printableH = dims.pxHeight - pageMargins.top - pageMargins.bottom;
      // measurePageOffsets works in the zoomed coordinate space of
      // getBoundingClientRect, so scale the target up; then normalize the
      // results back to unzoomed px so the ghost transforms match the mm-sized
      // page frames (which the container's CSS zoom scales uniformly).
      const offsets = measurePageOffsets(el, printableH * zoomFactor).map((o) => o / zoomFactor);
      const docH = el.getBoundingClientRect().height / zoomFactor;
      const pages = offsets.map((top, i) => ({ top, height: (offsets[i + 1] ?? docH) - top }));
      setGhostPages(pages);
      setGhostHtml(editor.getHTML());
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [editor, pageFormat, dims.pxHeight, isPaginated, zoomFactor, pageMargins.top, pageMargins.bottom]);

  // Spellcheck: drive the WebView's native checker via DOM attributes so it stays
  // reactive to settings (WebView2 uses system dictionaries; WebKitGTK uses hunspell).
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    dom.setAttribute("spellcheck", settings.spellcheck === false ? "false" : "true");
    dom.setAttribute("lang", settings.docLang || "pt-BR");
  }, [editor, settings.spellcheck, settings.docLang]);

  // Heading numbering lives in plugin state; keep it in sync with the setting.
  useEffect(() => {
    editor?.commands.setHeadingNumbers(settings.numberHeadings === true);
  }, [editor, settings.numberHeadings]);

  // Same for tracked-changes recording.
  useEffect(() => {
    editor?.commands.setTrackChanges(settings.trackChanges === true);
  }, [editor, settings.trackChanges]);

  // Citations: (re)load the bibliography when its settings change, and again on
  // window focus (throttled) so edits made in Zotero show up when you return.
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

  // Keep the engine's cited-keys registry in doc order (numeric styles like
  // IEEE derive citation numbers from it). Debounced — typing must stay cheap.
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

  // Local AI engine, shared by the side panel and the selection bubble menu.
  const ai = useLocalAi(editor, settings, updateSettings);

  // ---- Tab operations (single editor, content swap) ----

  const switchTab = useCallback(
    (id: string) => {
      if (!editor || id === activeIdRef.current) return;
      const oldId = activeIdRef.current;
      const json = editor.getJSON();
      const target = tabsRef.current.find((t) => t.id === id);
      if (!target) return;
      // Persist the outgoing tab on its way out — switching must never leave
      // unsaved work behind. Fire-and-forget: a failure keeps the tab dirty
      // and surfaces in the status bar.
      const old = tabsRef.current.find((t) => t.id === oldId);
      if (old?.dirty && old.filePath) {
        cancelAutosave();
        queueSave({ id: old.id, filePath: old.filePath, format: old.format }, editor.getHTML()).catch(() => {});
      }
      setTabs((ts) => ts.map((t) => (t.id === oldId ? { ...t, doc: json } : t)));
      editor.commands.setContent(target.doc, { emitUpdate: false });
      setActiveId(id);
    },
    [editor, queueSave, cancelAutosave]
  );

  const newBlankTab = useCallback(() => {
    if (!editor) return;
    const oldId = activeIdRef.current;
    const json = editor.getJSON();
    const t = newTab();
    setTabs((ts) => ts.map((x) => (x.id === oldId ? { ...x, doc: json } : x)).concat(t));
    editor.commands.setContent(EMPTY_DOC, { emitUpdate: false });
    setActiveId(t.id);
  }, [editor]);

  const openDocFile = useCallback(
    (doc: DocFile) => {
      if (!editor) return;
      const oldId = activeIdRef.current;
      const active = tabsRef.current.find((t) => t.id === oldId);
      const reuse = !!active && !active.filePath && !active.dirty;

      if (reuse) {
        editor.commands.setContent(doc.html, { emitUpdate: false });
        const json = editor.getJSON();
        setTabs((ts) =>
          ts.map((t) => (t.id === oldId ? { ...t, filePath: doc.path, format: doc.format, doc: json, dirty: false } : t))
        );
      } else {
        const oldJson = editor.getJSON();
        editor.commands.setContent(doc.html, { emitUpdate: false });
        const newJson = editor.getJSON();
        const t = newTab({ filePath: doc.path, format: doc.format, doc: newJson, dirty: false });
        setTabs((ts) => ts.map((x) => (x.id === oldId ? { ...x, doc: oldJson } : x)).concat(t));
        setActiveId(t.id);
      }
      remember(doc.path);
    },
    [editor, remember]
  );

  const closeTab = useCallback(
    (id: string) => {
      const t = tabsRef.current.find((x) => x.id === id);
      if (!t || !editor) return;
      if (t.dirty && !window.confirm(`"${tabTitle(t)}" tem alterações não salvas. Fechar mesmo assim?`)) return;

      editSeq.current.delete(id);
      const idx = tabsRef.current.findIndex((x) => x.id === id);
      const remaining = tabsRef.current.filter((x) => x.id !== id);

      if (remaining.length === 0) {
        const nt = newTab();
        editor.commands.setContent(EMPTY_DOC, { emitUpdate: false });
        setTabs([nt]);
        setActiveId(nt.id);
        return;
      }
      if (id === activeIdRef.current) {
        const neighbor = remaining[Math.min(idx, remaining.length - 1)];
        editor.commands.setContent(neighbor.doc, { emitUpdate: false });
        setActiveId(neighbor.id);
      }
      setTabs(remaining);
    },
    [editor]
  );

  // ---- File operations ----

  const handleOpen = useCallback(async () => {
    try {
      const doc = await openDocument();
      if (doc) openDocFile(doc);
    } catch (e) {
      window.alert(`Não foi possível abrir:\n${e}`);
    }
  }, [openDocFile]);

  const handleOpenRecent = useCallback(
    async (path: string) => {
      try {
        openDocFile(await openDocumentPath(path));
      } catch (e) {
        window.alert(`Não foi possível abrir:\n${e}`);
      }
    },
    [openDocFile]
  );

  const handleSaveAs = useCallback(async () => {
    if (!editor) return;
    const at = tabsRef.current.find((t) => t.id === activeIdRef.current);
    const suggested = at?.filePath ? baseName(at.filePath) : "sem-titulo.md";
    try {
      const doc = await saveDocumentAs(editor.getHTML(), suggested);
      if (doc) {
        const id = activeIdRef.current;
        setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, filePath: doc.path, format: doc.format, dirty: false } : t)));
        remember(doc.path);
        cancelAutosave();
      }
    } catch (e) {
      window.alert(`Não foi possível salvar:\n${e}`);
    }
  }, [editor, remember, cancelAutosave]);

  const handleSave = useCallback(async () => {
    if (!editor) return;
    const at = tabsRef.current.find((t) => t.id === activeIdRef.current);
    if (!at) return;
    if (!at.filePath) {
      await handleSaveAs();
      return;
    }
    try {
      await queueSave({ id: at.id, filePath: at.filePath, format: at.format }, editor.getHTML());
      remember(at.filePath);
      cancelAutosave();
    } catch (e) {
      window.alert(`Não foi possível salvar:\n${e}`);
    }
  }, [editor, handleSaveAs, remember, cancelAutosave, queueSave]);

  const handleInsertImage = useCallback(async () => {
    if (!editor) return;
    const dataUri = await pickImageDataUri();
    if (dataUri) editor.chain().focus().setImage({ src: dataUri }).run();
  }, [editor]);

  // Snapshot the document and settings at click time; the preview modal
  // paginates that snapshot and prints exactly what it shows.
  const handleExportPdf = useCallback(() => {
    if (!editor) return;
    const at = tabsRef.current.find((t) => t.id === activeIdRef.current);
    const s = loadSettings();
    setPrintJob({
      html: editor.getHTML(),
      options: {
        title: at ? tabTitle(at) : "Documento",
        pageFormat: s.pageFormat || "a4",
        margins: s.pageMargins,
        header: s.pageHeader,
        footer: s.pageFooter,
        chromeOnFirst: s.pageChromeOnFirst !== false,
        numberHeadings: s.numberHeadings === true,
      },
    });
  }, [editor]);

  // ---- Font import ----
  const handleImportFont = useCallback(async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [
          { name: "Fontes", extensions: ["ttf", "otf", "ttc"] },
        ],
      });
      if (!selected || Array.isArray(selected)) return;
      const info = await invoke<{ name: string; base64: string }>("import_font", { path: selected });
      const fontName = info.name;
      const dataUrl = `url('data:font/ttf;base64,${info.base64}')`;
      const fontFace = new FontFace(fontName, dataUrl);
      await fontFace.load();
      document.fonts.add(fontFace);
      const existing = customFonts.find((f) => f.name === fontName || f.path === selected);
      if (!existing) {
        const next = [...customFonts, { name: fontName, path: selected }];
        updateSettings({ customFonts: next });
      }
    } catch (e) {
      window.alert(`Não foi possível importar a fonte:\n${e}`);
    }
  }, [customFonts, updateSettings]);

  // ---- Page format / margins ----
  const handlePageFormatChange = useCallback(
    (format: PageFormat) => updateSettings({ pageFormat: format }),
    [updateSettings]
  );

  const handleMarginsChange = useCallback(
    (margins: PageMargins) => updateSettings({ pageMargins: margins }),
    [updateSettings]
  );

  // ---- Zoom (50–200%) ----
  const setZoomAbs = useCallback(
    (z: number) => updateSettings({ zoom: Math.min(200, Math.max(50, Math.round(z))) }),
    [updateSettings]
  );
  // Read the freshest value from storage so keyboard/wheel steps never go stale.
  const adjustZoom = useCallback(
    (delta: number) => setZoomAbs((loadSettings().zoom || 100) + delta),
    [setZoomAbs]
  );

  // ---- Templates ----
  const handleApplyTemplate = useCallback(
    (tmpl: DocTemplate) => {
      updateSettings({
        pageFormat: tmpl.pageFormat,
        pageMargins: tmpl.margins,
        ...(tmpl.header && { pageHeader: tmpl.header }),
        ...(tmpl.footer && { pageFooter: tmpl.footer }),
        ...(tmpl.chromeOnFirst !== undefined && { pageChromeOnFirst: tmpl.chromeOnFirst }),
      });
      if (!editor) return;
      // Deferred out of the React event: setContent instantiates NodeViews
      // (TOC, bibliography) through flushSync, which React rejects mid-render.
      setTimeout(() => {
        // Starter content (cover page etc.) only on an empty doc — never wipe work.
        const { doc } = editor.state;
        if (tmpl.content && doc.textContent.trim() === "" && doc.childCount <= 1) {
          editor.commands.setContent(tmpl.content());
          markDirty();
          // The starter carries its own alignment (centered cover lines) — apply
          // the template's font/spacing but keep the blanket textAlign off.
          applyTemplateContent(editor, { ...tmpl, textAlign: undefined });
        } else {
          applyTemplateContent(editor, tmpl);
        }
      }, 0);
    },
    [editor, updateSettings, markDirty]
  );

  // ---- Versioning ----
  const handleSaveVersion = useCallback(
    async (name: string) => {
      if (!editor) return;
      const at = tabsRef.current.find((t) => t.id === activeIdRef.current);
      if (!at || !at.filePath) {
        window.alert("Salve o documento antes de criar uma versão.");
        return;
      }
      try {
        const content = JSON.stringify(editor.getJSON());
        await invoke("save_version", { docPath: at.filePath, name, content });
      } catch (e) {
        window.alert(`Erro ao salvar versão:\n${e}`);
      }
    },
    [editor]
  );

  const handleRestoreVersion = useCallback(
    async (versionId: string) => {
      if (!editor) return;
      const at = tabsRef.current.find((t) => t.id === activeIdRef.current);
      if (!at || !at.filePath) return;
      try {
        const raw = await invoke<string>("load_version", { docPath: at.filePath, versionId });
        const json = JSON.parse(raw);
        editor.commands.setContent(json, { emitUpdate: false });
        setTabs((ts) => ts.map((t) => (t.id === at.id ? { ...t, doc: json, dirty: true } : t)));
      } catch (e) {
        window.alert(`Erro ao restaurar versão:\n${e}`);
      }
    },
    [editor]
  );

  // The Rust side intercepts the window close and emits "close-requested".
  // We confirm here (we know which tabs are unsaved) and then quit via exit_app.
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    listen("close-requested", async () => {
      try {
        const dirtyCount = tabsRef.current.filter((t) => t.dirty).length;
        if (dirtyCount > 0) {
          const ok = await ask(
            `Você tem ${dirtyCount} documento(s) com alterações não salvas.\nSair mesmo assim?`,
            { title: "Sair do LocalOffice", kind: "warning" }
          );
          if (!ok) return;
        }
      } catch {
        /* if the dialog fails, fall through to exit so the user isn't trapped */
      }
      invoke("exit_app").catch((e) => console.error("exit_app:", e));
    }).then((un) => {
      if (cancelled) { un(); return; }
      unlisten = un;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // ---- Debounced autosave (only when idle; never while actively typing) ----
  const doAutosaveRef = useRef<() => void>(() => {});
  const doAutosave = useCallback(() => {
    autosaveTimer.current = null;
    firstDirtyAt.current = 0;
    if (!editor) return;
    const at = tabsRef.current.find((t) => t.id === activeIdRef.current);
    if (at && at.filePath && at.dirty) {
      queueSave({ id: at.id, filePath: at.filePath, format: at.format }, editor.getHTML()).catch(() => {
        // The tab stays dirty and the status bar shows the failure; retry with
        // backoff so a transient error (file lock, cloud sync) heals itself.
        if (!autosaveTimer.current) {
          autosaveTimer.current = window.setTimeout(() => doAutosaveRef.current(), 30_000);
        }
      });
    }
  }, [editor, queueSave]);
  doAutosaveRef.current = doAutosave;

  const scheduleAutosave = useCallback(() => {
    const at = tabsRef.current.find((t) => t.id === activeIdRef.current);
    if (!at || !at.filePath) return;
    const now = Date.now();
    if (firstDirtyAt.current === 0) firstDirtyAt.current = now;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    if (now - firstDirtyAt.current >= 60000) {
      doAutosave();
      return;
    }
    // pandoc-converted formats are heavier to write; give them a longer pause.
    const delay = at.format === "markdown" || at.format === "html" ? 2000 : 4000;
    autosaveTimer.current = window.setTimeout(doAutosave, delay);
  }, [doAutosave]);

  scheduleRef.current = scheduleAutosave;

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  // ---- Open a file passed at launch / forwarded by a 2nd instance ----
  const openedStartup = useRef(false);
  useEffect(() => {
    if (!editor || openedStartup.current) return;
    openedStartup.current = true;
    invoke<string | null>("get_startup_file")
      .then(async (p) => {
        if (p) {
          try {
            openDocFile(await openDocumentPath(p));
          } catch {}
        }
      })
      .catch(() => {});

    let cancelled = false;
    let unlisten: (() => void) | null = null;
    listen<string>("open-file", async (e) => {
      if (e.payload) {
        try {
          openDocFile(await openDocumentPath(e.payload));
        } catch {}
      }
    }).then((un) => {
      if (cancelled) { un(); return; }
      unlisten = un;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [editor, openDocFile]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        setFocusMode((v) => !v);
        return;
      }
      if (e.key === "Escape") setFocusMode(false);
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "s" && e.shiftKey) {
        e.preventDefault();
        handleSaveAs();
      } else if (k === "s") {
        e.preventDefault();
        handleSave();
      } else if (k === "o") {
        e.preventDefault();
        handleOpen();
      } else if (k === "n" || k === "t") {
        e.preventDefault();
        newBlankTab();
      } else if (k === "f" && !e.altKey) {
        e.preventDefault();
        setShowSearch(true);
      } else if (k === "w") {
        e.preventDefault();
        closeTab(activeIdRef.current);
      } else if (k === "=" || k === "+") {
        e.preventDefault();
        adjustZoom(10);
      } else if (k === "-" || k === "_") {
        e.preventDefault();
        adjustZoom(-10);
      } else if (k === "0") {
        e.preventDefault();
        setZoomAbs(100);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave, handleSaveAs, handleOpen, newBlankTab, closeTab, adjustZoom, setZoomAbs]);

  // ---- Ctrl+scroll to zoom (native listener so preventDefault isn't passive) ----
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      adjustZoom(e.deltaY < 0 ? 10 : -10);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [adjustZoom]);

  const pageStyle = useMemo(() => {
    const style: Record<string, string> = {
      padding: `${pageMargins.top}px ${pageMargins.right}px ${pageMargins.bottom}px ${pageMargins.left}px`,
    };
    if (pageFormat !== "classic") {
      style.width = dims.width;
      style.height = dims.height;
    }
    return style;
  }, [pageFormat, dims, pageMargins]);

  const activeTab = tabs.find((t) => t.id === activeId);

  return (
    <div className={"app" + (focusMode ? " focus-mode" : "")}>
      {focusMode && (
        <button className="focus-exit" onClick={() => setFocusMode(false)} title="Sair do modo foco (Esc ou F11)">
          ✕ foco
        </button>
      )}
      <MenuBar
        aiOpen={aiOpen}
        chaptersOpen={chaptersOpen}
        reviewOpen={reviewOpen}
        recents={recents}
        onNew={newBlankTab}
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onExportPdf={handleExportPdf}
        onToggleAi={() => setAiOpen((v) => !v)}
        onToggleChapters={() => setChaptersOpen((v) => !v)}
        onToggleReview={() => setReviewOpen((v) => !v)}
        onOpenRecent={handleOpenRecent}
        onOpenSettings={() => setShowSettings(true)}
        onVersionHistory={() => setShowVersionHistory((v) => !v)}
      />
      <TabStrip tabs={tabs} activeId={activeId} onSelect={switchTab} onClose={closeTab} onNew={newBlankTab} />
      {editor && (
        <Ribbon
          editor={editor}
          onInsertImage={handleInsertImage}
          pageFormat={pageFormat}
          onPageFormatChange={handlePageFormatChange}
          pageMargins={pageMargins}
          onMarginsChange={handleMarginsChange}
          systemFonts={systemFonts}
          customFonts={customFonts}
          onImportFont={handleImportFont}
          onApplyTemplate={handleApplyTemplate}
          numberHeadings={settings.numberHeadings === true}
          onToggleHeadingNumbers={() => updateSettings({ numberHeadings: !settings.numberHeadings })}
        />
      )}
      {editor && <AiBubbleMenu editor={editor} ai={ai} onOpenPanel={() => setAiOpen(true)} />}
      <div className="workspace">
        {chaptersOpen && editor && <ChaptersPanel editor={editor} onClose={() => setChaptersOpen(false)} />}
        {reviewOpen && editor && (
          <ReviewPanel
            editor={editor}
            trackChanges={settings.trackChanges === true}
            onToggleTrackChanges={() => updateSettings({ trackChanges: !settings.trackChanges })}
            authorName={settings.authorName || "Autor"}
            onClose={() => setReviewOpen(false)}
          />
        )}
        <div className="editor-main">
          <div className="editor-scroll" ref={scrollRef}>
            {showSearch && editor && <SearchBar editor={editor} onClose={() => setShowSearch(false)} />}
            <div className={`pages-container${isPaginated ? " paginated" : ""}`} style={{ zoom: zoomFactor }}>
              <div className={`page${isPaginated ? " fixed" : ""}`} style={pageStyle}>
                {isPaginated ? (
                  <div className="page-clip">
                    <EditorContent editor={editor} />
                  </div>
                ) : (
                  <EditorContent editor={editor} />
                )}
              </div>
              {isPaginated &&
                ghostPages.map((pg, i) => (
                  // Same padding/width as the editable page (via pageStyle) so the
                  // mirror reflows identically — otherwise offsets don't line up.
                  <div key={i} className="page fixed" style={pageStyle}>
                    <div className="page-clip" style={{ height: pg.height }}>
                      <div
                        className="page-ghost ProseMirror"
                        style={{ transform: `translateY(-${pg.top}px)` }}
                        dangerouslySetInnerHTML={{ __html: ghostHtml }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>
          {editor && (
            <StatusBar
              editor={editor}
              pageFormat={pageFormat}
              zoom={zoom}
              zoomFactor={zoomFactor}
              onZoomChange={setZoomAbs}
              measuredPages={isPaginated ? ghostPages.length + 1 : undefined}
              wordGoal={settings.wordGoal || 0}
              saveStatus={saveStatus}
            />
          )}
        </div>
        {aiOpen && <AiPanel editor={editor} ai={ai} onClose={() => setAiOpen(false)} />}
      </div>
      {showSettings && (
        <SettingsModal settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />
      )}
      {showVersionHistory && activeTab && (
        <VersionHistory
          tab={activeTab}
          onClose={() => setShowVersionHistory(false)}
          onSaveVersion={handleSaveVersion}
          onRestoreVersion={handleRestoreVersion}
        />
      )}
      {printJob && (
        <PrintPreview html={printJob.html} options={printJob.options} onClose={() => setPrintJob(null)} />
      )}
    </div>
  );
}

export default App;
