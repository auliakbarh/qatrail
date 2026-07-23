import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Modal } from "./Modal";

interface RightPanelProps {
  title: string;
  dirty?: boolean; // when true, closing asks for confirmation
  onClose: () => void;
  children: ReactNode;
}

const WIDTH_KEY = "qar_panel_w";
const MIN_W = 320;
const clampWidth = (w: number) => Math.min(Math.round(window.innerWidth * 0.8), Math.max(MIN_W, w));

// Right-side form panel (DESIGN.md: input goes here, not in a modal). Guards
// against losing unsaved input via a confirm modal when `dirty`. Left edge is
// drag-resizable; the chosen width is remembered across panels/sessions.
export function RightPanel({ title, dirty, onClose, children }: RightPanelProps) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [width, setWidth] = useState(() => clampWidth(Number(localStorage.getItem(WIDTH_KEY)) || Math.round(window.innerWidth / 3)));
  const dragging = useRef(false);
  const widthRef = useRef(width);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const w = clampWidth(window.innerWidth - e.clientX);
      widthRef.current = w;
      setWidth(w);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.userSelect = "";
      localStorage.setItem(WIDTH_KEY, String(widthRef.current));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const requestClose = () => {
    if (dirty) setConfirmOpen(true);
    else onClose();
  };

  return (
    <aside role="region" aria-label={title} style={{ width }} className="relative flex shrink-0 flex-col border-l border-border" >
      {/* Drag handle: widen/narrow the panel. */}
      <div
        onPointerDown={() => { dragging.current = true; document.body.style.userSelect = "none"; }}
        title={t("rp.resize")}
        className="absolute left-0 top-0 z-10 h-full w-1 -translate-x-1/2 cursor-col-resize hover:bg-primary/40"
      />
      <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button
          aria-label={t("c.close")}
          onClick={requestClose}
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t("rp.discardTitle")}
        footer={
          <>
            <button
              onClick={() => setConfirmOpen(false)}
              className="h-7 rounded border border-border px-3 text-xs hover:bg-muted"
            >
              {t("rp.keepEditing")}
            </button>
            <button
              onClick={() => {
                setConfirmOpen(false);
                onClose();
              }}
              className="h-7 rounded bg-destructive px-3 text-xs font-medium text-white hover:bg-destructive/90"
            >
              {t("rp.discard")}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">{t("rp.unsaved")}</p>
      </Modal>
    </aside>
  );
}
