import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

// Fetches a text-based attachment (markdown/json/csv/other; works with data: URLs)
// and renders it formatted. Used inside the right panel.
export function TextAttachmentViewer({ url, kind, label }: { url: string; kind: string; label?: string | null }) {
  const { t } = useTranslation();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setText(null);
    setError(false);
    fetch(url)
      .then((r) => r.text())
      .then((s) => { if (alive) setText(s); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [url]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">{label || kind}</span>
        <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary underline underline-offset-2">
          {t("c.open")}
        </a>
      </div>
      {error && <p className="text-xs text-destructive">{t("c.somethingWrong")}</p>}
      {text == null && !error && <p className="text-xs text-muted-foreground">{t("c.loading")}</p>}
      {text != null && <Rendered kind={kind} text={text} />}
    </div>
  );
}

function Rendered({ kind, text }: { kind: string; text: string }) {
  if (kind === "JSON") {
    let pretty = text;
    try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* keep raw */ }
    return <pre className="overflow-x-auto rounded border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed">{pretty}</pre>;
  }
  if (kind === "CSV") {
    const rows = text.trim().split(/\r?\n/).map((l) => l.split(","));
    return (
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-xs">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={i === 0 ? "border-b border-border bg-muted/40 font-medium" : "border-b border-border/50 last:border-0"}>
                {r.map((c, j) => <td key={j} className="px-2 py-1">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (kind === "MARKDOWN") return <Markdown text={text} />;
  return <pre className="overflow-x-auto rounded border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{text}</pre>;
}

// Minimal markdown: headings, bold, bullet lists, paragraphs. No deps.
function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(<ul key={out.length} className="list-disc space-y-0.5 pl-5">{list.map((li, i) => <li key={i}>{inline(li)}</li>)}</ul>);
      list = [];
    }
  };
  lines.forEach((ln) => {
    const h = ln.match(/^(#{1,4})\s+(.*)$/);
    const li = ln.match(/^\s*[-*]\s+(.*)$/);
    if (h) { flush(); const lvl = h[1].length; out.push(<div key={out.length} className={lvl <= 1 ? "text-sm font-semibold" : "text-xs font-semibold"}>{inline(h[2])}</div>); }
    else if (li) { list.push(li[1]); }
    else if (ln.trim() === "") { flush(); }
    else { flush(); out.push(<p key={out.length} className="text-xs text-muted-foreground">{inline(ln)}</p>); }
  });
  flush();
  return <div className="space-y-1.5 rounded border border-border bg-muted/20 p-3">{out}</div>;
}

// **bold** inline only.
function inline(s: string): React.ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i} className="text-foreground">{p.slice(2, -2)}</b> : <span key={i}>{p}</span>));
}
