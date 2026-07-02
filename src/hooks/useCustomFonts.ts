import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { CustomFont, Settings } from "../lib/settings";

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

  return { systemFonts, handleImportFont };
}
