import { create } from "zustand";
import i18n from "../i18n";

export type ToastType = "success" | "error" | "warning";
export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, type?: ToastType) => void;
  remove: (id: number) => void;
}

let seq = 0;

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  push: (message, type = "success") => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Standard "no access" toast for guarded-but-clickable actions.
export function denied(message?: string) {
  useToast.getState().push(message ?? i18n.t("c.permissionDenied"), "error");
}

// Run a mutation with success/failure toasts. On failure the real error is
// swallowed (masked) — the user sees only `failMsg`, never a backend/client
// error string. Returns the result on success, or null on failure.
export async function withToast<T>(
  op: Promise<T>,
  successMsg: string,
  failMsg?: string,
): Promise<T | null> {
  failMsg = failMsg ?? i18n.t("c.somethingWrong");
  const { push } = useToast.getState();
  try {
    const r = await op;
    push(successMsg, "success");
    return r;
  } catch {
    push(failMsg, "error");
    return null;
  }
}

// Convenience: copy text to clipboard, then toast. Falls back to a warning
// toast (with the value) when the clipboard API is unavailable/blocked.
export async function copyWithToast(text: string, label: string) {
  const { push } = useToast.getState();
  try {
    await navigator.clipboard.writeText(text);
    push(i18n.t("t.copied", { label }), "success");
  } catch {
    push(i18n.t("t.copyManual", { label, text }), "warning");
  }
}
