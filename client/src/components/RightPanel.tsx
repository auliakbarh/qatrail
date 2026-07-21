import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Modal } from "./Modal";

interface RightPanelProps {
  title: string;
  dirty?: boolean; // when true, closing asks for confirmation
  onClose: () => void;
  children: ReactNode;
}

// Right-side form panel (DESIGN.md: input goes here, not in a modal). Guards
// against losing unsaved input via a confirm modal when `dirty`.
export function RightPanel({ title, dirty, onClose, children }: RightPanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const requestClose = () => {
    if (dirty) setConfirmOpen(true);
    else onClose();
  };

  return (
    <aside className="flex w-1/3 min-w-[320px] shrink-0 flex-col border-l border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button
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
        title="Discard changes?"
        footer={
          <>
            <button
              onClick={() => setConfirmOpen(false)}
              className="h-7 rounded border border-border px-3 text-xs hover:bg-muted"
            >
              Keep editing
            </button>
            <button
              onClick={() => {
                setConfirmOpen(false);
                onClose();
              }}
              className="h-7 rounded bg-destructive px-3 text-xs font-medium text-white hover:bg-destructive/90"
            >
              Discard
            </button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">You have unsaved changes. Discard them?</p>
      </Modal>
    </aside>
  );
}
