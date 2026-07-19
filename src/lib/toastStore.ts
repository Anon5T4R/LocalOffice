import { useSyncExternalStore } from "react";

/**
 * Toasts fora do React (mesmo padrão do saveStatusStore): `pushToast` pode ser
 * chamado de qualquer hook/helper sem prop-drilling, e só o componente
 * <Toasts/> (que assina via useSyncExternalStore) re-renderiza. Substitui os
 * `window.alert()` de feedback — padrão da suíte (LocalFiles/LocalAgenda…):
 * pilha no rodapé, some sozinha, clique dispensa.
 */

export type ToastKind = "info" | "error" | "ok";

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

let toasts: Toast[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

export function pushToast(kind: ToastKind, text: string): void {
  toasts = [...toasts, { id: nextId++, kind, text }];
  listeners.forEach((l) => l());
}

export function dismissToast(id: number): void {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  listeners.forEach((l) => l());
}

function getToasts(): Toast[] {
  return toasts;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, getToasts);
}
