import { useState } from "react";
import { Modal } from "./Modal";

interface DeleteConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  label: string; // what is being deleted, e.g. project name
  note?: string; // extra warning (e.g. cascade)
}

// Destructive-action guard: user must type DELETE to enable the button (per requirement).
export function DeleteConfirm({ open, onClose, onConfirm, label, note }: DeleteConfirmProps) {
  const [text, setText] = useState("");
  const armed = text === "DELETE";

  const close = () => {
    setText("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Delete ${label}`}
      footer={
        <>
          <button onClick={close} className="h-7 rounded border border-border px-3 text-xs hover:bg-muted">
            Cancel
          </button>
          <button
            disabled={!armed}
            onClick={() => {
              onConfirm();
              close();
            }}
            className="h-7 rounded bg-destructive px-3 text-xs font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
          >
            Confirm delete
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        This cannot be undone.{note ? ` ${note}` : ""} Type <b className="text-foreground">DELETE</b> to confirm.
      </p>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="DELETE"
        className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </Modal>
  );
}
