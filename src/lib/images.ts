import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
};

/**
 * Open a picker, read the chosen image and return it as a base64 data URI.
 * Embedding as a data URI keeps the document self-contained across MD/HTML/DOCX/ODT.
 */
export async function pickImageDataUri(): Promise<string | null> {
  const selected = await openDialog({
    multiple: false,
    filters: [{ name: "Imagens", extensions: Object.keys(MIME) }],
  });
  if (!selected || Array.isArray(selected)) return null;
  const ext = selected.split(".").pop()?.toLowerCase() ?? "png";
  const b64 = await invoke<string>("read_file_base64", { path: selected });
  return `data:${MIME[ext] ?? "image/png"};base64,${b64}`;
}
