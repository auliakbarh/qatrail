import { Download } from "lucide-react";

// Renders attachments with inline previews: images as thumbnails (click to open
// full size), videos with a playable player + download, everything else as a link chip.
interface Attachment {
  order: number;
  url: string;
  kind: string;
  label?: string | null;
}

const TEXT_KINDS = new Set(["MARKDOWN", "JSON", "CSV", "OTHER"]);

export function AttachmentList({ items, onOpenText }: { items: Attachment[]; onOpenText?: (a: Attachment) => void }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {items.map((a) => {
        const caption = `${a.order}. ${a.label || a.kind}`;
        // Text-based files open formatted in the right panel (if a handler is given).
        if (onOpenText && TEXT_KINDS.has(a.kind)) {
          return (
            <button
              key={a.order}
              onClick={() => onOpenText(a)}
              className="inline-flex h-fit items-center self-start rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
              title={caption}
            >
              {caption}
            </button>
          );
        }
        if (a.kind === "IMAGE") {
          return (
            <a
              key={a.order}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="group block w-40 overflow-hidden rounded border border-border hover:bg-muted"
              title={caption}
            >
              <img src={a.url} alt={caption} className="h-24 w-full object-cover" loading="lazy" />
              <div className="truncate px-2 py-1 text-[10px] text-muted-foreground">{caption}</div>
            </a>
          );
        }
        if (a.kind === "VIDEO") {
          return (
            <div key={a.order} className="w-56 overflow-hidden rounded border border-border">
              <video src={a.url} controls preload="metadata" className="h-32 w-full bg-black object-contain" />
              <div className="flex items-center justify-between gap-2 px-2 py-1">
                <span className="truncate text-[10px] text-muted-foreground">{caption}</span>
                <a
                  href={a.url}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-primary underline underline-offset-2"
                >
                  <Download className="h-3 w-3" /> Download
                </a>
              </div>
            </div>
          );
        }
        return (
          <a
            key={a.order}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-fit items-center self-start rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
          >
            {caption}
          </a>
        );
      })}
    </div>
  );
}
