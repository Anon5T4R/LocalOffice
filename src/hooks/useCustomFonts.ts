import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { CustomFont, Settings } from "../lib/settings";

const FONT_MIME: Record<string, string> = {
  ttf: "font/ttf",
  otf: "font/otf",
  ttc: "font/collection",
  woff: "font/woff",
  woff2: "font/woff2",
};

/** Load a font file (by path) into a live document.fonts FontFace. */
async function registerFontFace(path: string): Promise<string> {
  const info = await invoke<{ name: string; base64: string }>("import_font", { path });
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const mime = FONT_MIME[ext] ?? "application/octet-stream";
  const fontFace = new FontFace(info.name, `url('data:${mime};base64,${info.base64}')`);
  await fontFace.load();
  document.fonts.add(fontFace);
  return info.name;
}

/**
 * Fonts available to the editor: system font names (scanned by the backend)
 * plus user-imported font files, re-registered as FontFaces on startup.
 */
export function useCustomFonts(
  customFonts: CustomFont[],
  updateSettings: (patch: Partial<Settings>) => void
) {
  const [systemFonts, setSystemFonts] = useState<string[]>([]);

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
          await registerFontFace(font.path);
        } catch { /* skip fonts that can't be loaded */ }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImportFont = useCallback(async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [
          { name: "Fontes", extensions: ["ttf", "otf", "ttc"] },
        ],
      });
      if (!selected || Array.isArray(selected)) return;
      const fontName = await registerFontFace(selected);
      const existing = customFonts.find((f) => f.name === fontName || f.path === selected);
      if (!existing) {
        const next = [...customFonts, { name: fontName, path: selected }];
        updateSettings({ customFonts: next });
      }
    } catch (e) {
      window.alert(`Não foi possível importar a fonte:\n${e}`);
    }
  }, [customFonts, updateSettings]);

  return { systemFonts, handleImportFont };
}
