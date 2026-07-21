import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      title={`${t("c.delete")} ${label}`}
      footer={
        <>
          <button onClick={close} className="h-7 rounded border border-border px-3 text-xs hover:bg-muted">
            {t("c.cancel")}
          </button>
          <button
            disabled={!armed}
            onClick={() => {
              onConfirm();
              close();
            }}
            className="h-7 rounded bg-destructive px-3 text-xs font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
          >
            {t("del.confirm")}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        {t("del.cannotUndo")}{note ? ` ${note}` : ""} {t("del.typePre")} <b className="text-foreground">DELETE</b> {t("del.typePost")}
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
