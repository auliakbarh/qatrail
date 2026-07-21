import { useState } from "react";
import { Modal } from "./Modal";

interface Props {
  open: boolean;
  title: string;
  label: string;
  required?: boolean;
  confirmLabel?: string;
  destructive?: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}

// Small modal to capture a single free-text value (reject reason, clarify note).
// Replaces browser prompt() (disallowed by requirement).
export function TextPromptModal({
  open,
  title,
  label,
  required,
  confirmLabel = "Submit",
  destructive,
  onClose,
  onSubmit,
}: Props) {
  const [text, setText] = useState("");
  const close = () => {
    setText("");
    onClose();
  };
  const disabled = required ? !text.trim() : false;
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      footer={
        <>
          <button onClick={close} className="h-7 rounded border border-border px-3 text-xs hover:bg-muted">
            Cancel
          </button>
          <button
            disabled={disabled}
            onClick={() => {
              onSubmit(text.trim());
              close();
            }}
            className={`h-7 rounded px-3 text-xs font-medium disabled:opacity-50 ${
              destructive
                ? "bg-destructive text-white hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <label className="mb-1.5 block text-sm font-medium">
        {label} {!required && <span className="font-normal text-muted-foreground">(optional)</span>}
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </Modal>
  );
}
