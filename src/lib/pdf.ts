function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render the document to a print view and open the browser's print-to-PDF.
 * Header/footer repeat on every page using the table thead/tfoot trick (reliable
 * in Chromium). Page-number tokens {p}/{n} are left to the print dialog's own
 * header/footer option, since live page numbers need a pagination engine.
 */
export function exportToPdf(contentHtml: string, header: string, footer: string): void {
  document.getElementById("print-root")?.remove();

  const root = document.createElement("div");
  root.id = "print-root";
  root.innerHTML = `
    <table class="print-table">
      <thead><tr><td><div class="print-header">${escapeHtml(header)}</div></td></tr></thead>
      <tbody><tr><td><div class="print-content">${contentHtml}</div></td></tr></tbody>
      <tfoot><tr><td><div class="print-footer">${escapeHtml(footer)}</div></td></tr></tfoot>
    </table>`;
  document.body.appendChild(root);

  const cleanup = () => {
    root.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  // Fallback cleanup in case afterprint doesn't fire.
  setTimeout(cleanup, 60000);

  window.print();
}
