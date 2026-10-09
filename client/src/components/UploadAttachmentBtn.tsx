import { useRef, useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { Loader2, Upload } from "lucide-react";
import { CREATE_UPLOAD_URL, HEALTH } from "../graphql";
import { useToast, withToast } from "../store/toast";

export interface UploadedAttachment {
  url: string;
  kind: string;
  label: string;
}

const MAX_BYTES = 100 * 1024 * 1024; // mirrors MAX_UPLOAD_BYTES in server/src/s3.ts

const EXT_KIND: Record<string, string> = {
  md: "MARKDOWN", markdown: "MARKDOWN", json: "JSON", csv: "CSV", pdf: "PDF",
  doc: "DOC", docx: "DOC", xls: "XLS", xlsx: "XLS",
};

export function kindOf(file: { name: string; type: string }): string {
  if (file.type.startsWith("image/")) return "IMAGE";
  if (file.type.startsWith("video/")) return "VIDEO";
  return EXT_KIND[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? "OTHER";
}

// "Upload file" next to "+ Attachment": sends each picked file straight to S3
// on a presigned PUT, then hands back a filled attachment row. The form saves
// it like a pasted URL. Hidden when the server has no bucket configured.
export function UploadAttachmentBtn({ onUploaded }: { onUploaded: (a: UploadedAttachment) => void }) {
  const { t } = useTranslation();
  const { data } = useQuery(HEALTH, { fetchPolicy: "cache-first" });
  const [createUploadUrl] = useMutation(CREATE_UPLOAD_URL);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!data?.health?.uploadEnabled) return null;

  async function upload(files: File[]) {
    const tooBig = files.find((f) => f.size > MAX_BYTES);
    if (tooBig) return useToast.getState().push(t("form.uploadTooBig", { name: tooBig.name }), "error");
    setBusy(true);
    await withToast(
      (async () => {
        // Sequential: keeps the rows in the order picked, and one bad file stops the rest.
        for (const file of files) {
          const contentType = file.type || "application/octet-stream";
          const { data } = await createUploadUrl({ variables: { fileName: file.name, contentType, size: file.size } });
          const { uploadUrl, url } = data.createUploadUrl;
          const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
          if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);
          onUploaded({ url, kind: kindOf(file), label: file.name });
        }
        return files.length;
      })(),
      t("form.uploaded", { n: files.length }),
    );
    setBusy(false);
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = ""; // picking the same file again must fire onChange
          if (files.length) void upload(files);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="flex h-7 items-center gap-1.5 rounded border border-border px-2 text-xs hover:bg-muted disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        {busy ? t("form.uploading") : t("form.upload")}
      </button>
    </>
  );
}
