/**
 * Render the document to a print view and open the browser's print-to-PDF.
 * Manual page breaks become real page breaks (via CSS in App.css). Page numbers
 * can be enabled in the print dialog's own header/footer option.
 */
export function exportToPdf(contentHtml: string): void {
  document.getElementById("print-root")?.remove();

  const root = document.createElement("div");
  root.id = "print-root";
  root.innerHTML = `<div class="print-content">${contentHtml}</div>`;
  document.body.appendChild(root);

  const cleanup = () => {
    root.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  setTimeout(cleanup, 60000);

  window.print();
}
