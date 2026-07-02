import { contentTypographyCss } from "../lib/contentTypography";

// Inject the shared content typography for the editor. A runtime <style>
// (instead of rules duplicated in App.css) so the editor and the print
// pipeline literally read the same source — see lib/contentTypography.ts.
// Appended to <head> after the bundled stylesheets, so at equal specificity
// these rules win; App.css keeps only the color/decoration side of the same
// selectors.
const style = document.createElement("style");
style.id = "content-typography";
style.textContent = contentTypographyCss(".ProseMirror");
document.head.appendChild(style);
