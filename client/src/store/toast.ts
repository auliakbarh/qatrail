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

// A refusal the server meant, as opposed to something that went wrong: the user
// learns *why* the action was refused — "another QA has to approve this report
// first" instead of "something went wrong", which is unactionable and reads like
// a bug. The allow-list is the set of `err.<CODE>` keys in i18n.ts, so writing
// the wording is what publishes a code; there is no second list to fall out of
// step. Everything else stays masked — raw Prisma/GraphQL text belongs in the
// log, and the server's English is not our UI.
export function refusalMessage(err: any): string | null {
  const code = err?.graphQLErrors?.[0]?.extensions?.code ?? err?.extensions?.code;
  if (typeof code !== "string" || !i18n.exists(`err.${code}`)) return null;
  return i18n.t(`err.${code}`);
}

// Run a mutation with success/failure toasts. A refusal the server meant is
// reported as itself; every other error is swallowed (masked) and the user sees
// only `failMsg`. Returns the result on success, or null on failure.
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
  } catch (e) {
    push(refusalMessage(e) ?? failMsg, "error");
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
