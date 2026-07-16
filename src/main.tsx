import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { SettingsProvider } from "./state/SettingsContext";
import { useLocale } from "./lib/i18n";

// Remonta a árvore do App na troca de idioma (todo t() reavalia), mantendo os
// providers POR FORA para o estado deles (settings, error boundary) persistir.
function Root() {
  const locale = useLocale();
  return <App key={locale} />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SettingsProvider>
        <Root />
      </SettingsProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
