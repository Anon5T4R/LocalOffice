import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Recent,
  Settings,
  addRecent,
  applyTheme,
  loadRecents,
  loadSettings,
  saveSettings,
} from "../lib/settings";
import { useCustomFonts } from "../hooks/useCustomFonts";

export interface SettingsContextValue {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  recents: Recent[];
  remember: (path: string) => void;
  systemFonts: string[];
  importFont: () => Promise<void>;
}

const SettingsCtx = createContext<SettingsContextValue | null>(null);

/** Owns the persisted app settings, recents and font registry. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [recents, setRecents] = useState<Recent[]>(() => loadRecents());

  useEffect(() => {
    applyTheme(settings.theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const next = saveSettings(patch);
    setSettings(next);
    if (patch.theme) applyTheme(patch.theme);
  }, []);

  const remember = useCallback((path: string) => setRecents(addRecent(path)), []);

  const { systemFonts, handleImportFont } = useCustomFonts(settings.customFonts || [], updateSettings);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, updateSettings, recents, remember, systemFonts, importFont: handleImportFont }),
    [settings, updateSettings, recents, remember, systemFonts, handleImportFont]
  );

  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error("useSettings deve ser usado dentro de <SettingsProvider>");
  return ctx;
}
