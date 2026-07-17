import { DEFAULT_MODELS_DIR } from "./ai";
import { DEFAULT_MARGINS } from "./pageGeometry";

export type Theme =
  | "auto"
  | "light"
  | "dark"
  | "nature"
  | "darkblue"
  | "calmgreen"
  | "pastelpink"
  | "punkprincess";
export type PageFormat = "classic" | "a4" | "a5" | "letter" | "a3";

export interface PageMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface CustomFont {
  name: string;
  path: string;
}

/**
 * One line of page chrome (header or footer) for print/PDF. Each slot accepts
 * free text plus the placeholders {page}, {pages}, {title} and {date}.
 */
export interface HeaderFooterSpec {
  left: string;
  center: string;
  right: string;
}

export const EMPTY_HEADER_FOOTER: HeaderFooterSpec = { left: "", center: "", right: "" };

export interface Settings {
  theme: Theme;
  modelsDir: string;
  lastModelPath: string;
  ngl: number;
  ctx: number;
  pageFormat: PageFormat;
  pageMargins: PageMargins;
  customFonts: CustomFont[];
  spellcheck: boolean;
  docLang: string;
  zoom: number;
  pageHeader: HeaderFooterSpec;
  pageFooter: HeaderFooterSpec;
  /** Print header/footer on the first page too (off for cover pages). */
  pageChromeOnFirst: boolean;
  /** Automatic heading numbering (1, 1.1, 1.1.1…) in editor and print. */
  numberHeadings: boolean;
  /** Bibliography file (.bib from Zotero/Better BibTeX, or CSL-JSON). */
  bibPath: string;
  /** Citation style: bundled id ("abnt", "apa", "chicago", "ieee") or "custom". */
  cslStyle: string;
  /** Path to a user-provided .csl file (used when cslStyle === "custom"). */
  customCslPath: string;
  /** Name recorded on comments and tracked changes. */
  authorName: string;
  /** Whether edits are being recorded as tracked changes. */
  trackChanges: boolean;
  /** Word-count goal shown in the status bar (0 = off). */
  wordGoal: number;
}

const DEFAULTS: Settings = {
  theme: "auto",
  modelsDir: DEFAULT_MODELS_DIR,
  lastModelPath: "",
  ngl: 0,
  ctx: 4096,
  pageFormat: "classic",
  pageMargins: { ...DEFAULT_MARGINS },
  customFonts: [],
  spellcheck: true,
  docLang: "pt-BR",
  zoom: 100,
  pageHeader: { ...EMPTY_HEADER_FOOTER },
  pageFooter: { ...EMPTY_HEADER_FOOTER, center: "{page}" },
  pageChromeOnFirst: true,
  numberHeadings: false,
  bibPath: "",
  cslStyle: "abnt",
  customCslPath: "",
  authorName: "Autor",
  trackChanges: false,
  wordGoal: 0,
};

const SETTINGS_KEY = "localoffice.settings";
const RECENTS_KEY = "localoffice.recents";
const MAX_RECENTS = 10;

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

/** Apply the chosen theme to the document root. */
export function applyTheme(theme: Theme): void {
  const el = document.documentElement;
  if (theme === "auto") delete el.dataset.theme;
  else el.dataset.theme = theme;
}

export interface Recent {
  path: string;
  name: string;
  ts: number;
}

export function loadRecents(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addRecent(path: string): Recent[] {
  const name = path.split(/[\\/]/).pop() || path;
  const list = loadRecents().filter((r) => r.path !== path);
  list.unshift({ path, name, ts: Date.now() });
  const trimmed = list.slice(0, MAX_RECENTS);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function clearRecents(): void {
  localStorage.removeItem(RECENTS_KEY);
}
