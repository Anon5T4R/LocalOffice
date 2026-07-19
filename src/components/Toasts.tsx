import { useEffect } from "react";
import { dismissToast, useToasts } from "../lib/toastStore";

/**
 * Toasts empilhados no rodapé (somem sozinhos; clique dispensa). Erros ficam
 * mais tempo na tela porque carregam o detalhe da falha — o alert() que eles
 * substituem era bloqueante e dava tempo infinito de leitura.
 */
export function Toasts() {
  const toasts = useToasts();

  useEffect(() => {
    if (toasts.length === 0) return;
    const first = toasts[0];
    const timer = setTimeout(() => dismissToast(first.id), first.kind === "error" ? 7000 : 4000);
    return () => clearTimeout(timer);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast ${toast.kind}`}
          onClick={() => dismissToast(toast.id)}
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
}
