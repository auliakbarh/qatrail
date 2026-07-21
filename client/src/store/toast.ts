import { create } from "zustand";

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

// Run a mutation with success/failure toasts. On failure the real error is
// swallowed (masked) — the user sees only `failMsg`, never a backend/client
// error string. Returns the result on success, or null on failure.
export async function withToast<T>(
  op: Promise<T>,
  successMsg: string,
  failMsg = "Something went wrong. Please try again.",
): Promise<T | null> {
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
    push(`${label} copied to clipboard`, "success");
  } catch {
    push(`${label}: ${text} (copy manually)`, "warning");
  }
}
