/**
 * Spike isolado (Fase 2 da refatoração): renderiza o MESMO documento com o
 * MESMO CSS de impressão nos dois motores de CSS Paged Media, lado a lado.
 * Rodar: npx vite scripts/spike-vivliostyle --port 1435
 * Veredito e análise: docs/SPIKE-VIVLIOSTYLE.md
 */
import { Previewer } from "pagedjs";
import { CoreViewer } from "@vivliostyle/core";

// Subconjunto fiel do buildPrintCss do app (A4, margin boxes, TOC com
// target-counter, quebras manuais, notas, tabelas).
const printCss = `
  @page {
    size: 210mm 297mm;
    margin: 56px 72px 56px 72px;
    @top-center { content: "Fixture — Relatório de Teste"; }
    @bottom-center { content: counter(page) " / " counter(pages); }
  }
  @page :first {
    @top-center { content: none; }
    @bottom-center { content: none; }
  }
  .print-content { font-size: 12pt; line-height: 1.5; color: #000; }
  .print-content table { border-collapse: collapse; width: 100%; }
  .print-content th, .print-content td { border: 1px solid #999; padding: 4px 8px; }
  .print-content [data-page-break] { break-after: page; border: none; height: 0; margin: 0; }
  .print-content .footnotes { margin-top: 2em; padding-top: 0.6em; border-top: 1px solid #999; font-size: 0.85em; }
  .print-content .footnote-item p { display: inline; margin: 0; }
  .print-content nav.toc { margin: 1em 0 2em; }
  .print-content .toc-header { font-size: 1.4em; font-weight: 700; margin-bottom: 0.6em; }
  .print-content a.toc-entry { display: flex; align-items: baseline; gap: 6px; margin: 0.3em 0; color: #000; text-decoration: none; }
  .print-content .toc-dots { flex: 1; min-width: 24px; border-bottom: 1px dotted #999; }
  .print-content a.toc-entry::after { content: target-counter(attr(href), page); }
  .print-content a.toc-entry.lvl-2 { padding-left: 1.4em; }
`;

/** Mesmo preprocessing do app: nav[data-toc] vira lista de âncoras. */
function prepare(doc) {
  const entries = Array.from(doc.querySelectorAll("h1, h2")).map((h) => ({
    level: Number(h.tagName[1]),
    text: h.textContent ?? "",
    id: h.id,
  }));
  doc.querySelectorAll("nav[data-toc]").forEach((nav) => {
    nav.className = "toc";
    nav.replaceChildren();
    const header = doc.createElement("div");
    header.className = "toc-header";
    header.textContent = "Sumário";
    nav.appendChild(header);
    for (const e of entries) {
      const a = doc.createElement("a");
      a.href = `#${e.id}`;
      a.className = `toc-entry lvl-${e.level}`;
      a.innerHTML = `<span class="toc-title"></span><span class="toc-dots"></span>`;
      a.querySelector(".toc-title").textContent = e.text;
      nav.appendChild(a);
    }
  });
}

const fixtureText = await (await fetch("./fixture.html")).text();

// ---- paged.js ----
const pagedStat = document.getElementById("paged-stat");
try {
  const doc = new DOMParser().parseFromString(fixtureText, "text/html");
  prepare(doc);
  const cssUrl = URL.createObjectURL(new Blob([printCss], { type: "text/css" }));
  const template = document.createElement("template");
  template.innerHTML = `<div class="print-content">${doc.body.innerHTML}</div>`;
  const t0 = performance.now();
  const flow = await new Previewer().preview(
    template.content,
    [cssUrl],
    document.getElementById("paged-out")
  );
  pagedStat.textContent = `paged.js: ${flow.total} páginas em ${Math.round(performance.now() - t0)}ms`;
} catch (e) {
  pagedStat.textContent = `paged.js: ERRO ${e}`;
  console.error("paged.js:", e);
}

// ---- Vivliostyle ----
const vivStat = document.getElementById("viv-stat");
try {
  const doc = new DOMParser().parseFromString(fixtureText, "text/html");
  prepare(doc);
  // Vivliostyle aplica o CSS ao documento carregado; o seletor .print-content
  // do CSS compartilhado precisa de um wrapper equivalente no body.
  doc.body.innerHTML = `<div class="print-content">${doc.body.innerHTML}</div>`;
  const viewer = new CoreViewer(
    { viewportElement: document.getElementById("viv-viewport") },
    { renderAllPages: true, autoResize: false, pixelRatio: 0 }
  );
  const t0 = performance.now();
  viewer.addListener("loaded", () => {
    vivStat.textContent = `vivliostyle: ${viewer.getPageSizes().length} páginas em ${Math.round(performance.now() - t0)}ms`;
  });
  viewer.addListener("error", (p) => {
    console.error("vivliostyle:", p.content);
  });
  viewer.loadDocument(
    { url: new URL("./fixture.html", location.href).href },
    { documentObject: doc, authorStyleSheet: [{ text: printCss }] }
  );
} catch (e) {
  vivStat.textContent = `vivliostyle: ERRO ${e}`;
  console.error("vivliostyle:", e);
}
