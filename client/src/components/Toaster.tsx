import { useToast } from "../store/toast";

const STYLE: Record<string, string> = {
  success: "bg-green-600 text-white",
  error: "bg-destructive text-white",
  warning: "bg-yellow-500 text-white",
};

// Fixed top-right toast stack. Mounted once at the app root.
export function Toaster() {
  const { toasts, remove } = useToast();
  return (
    <div className="fixed right-4 top-4 z-[200] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start justify-between gap-3 rounded px-4 py-3 text-sm shadow-lg ${STYLE[t.type]}`}
        >
          <span className="break-words">{t.message}</span>
          <button onClick={() => remove(t.id)} className="shrink-0 text-lg leading-none opacity-80 hover:opacity-100">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
