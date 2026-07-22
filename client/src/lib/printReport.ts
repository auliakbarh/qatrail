import { fmtDateTime } from "./utils";

const esc = (s: any) =>
  String(s ?? "—").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

// Open a print-friendly window for an issue + its postmortem and trigger the
// browser's print dialog (Save as PDF). ponytail: native print beats a PDF lib.
export function printIssueReport(i: any) {
  const pm = i.postmortem;
  const row = (label: string, val: any) =>
    `<tr><th>${esc(label)}</th><td>${esc(val)}</td></tr>`;
  const section = (label: string, val: any) =>
    val ? `<h2>${esc(label)}</h2><p>${esc(val)}</p>` : "";

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(i.key)} — ${esc(i.title)}</title>
<style>
  body{font:13px/1.5 system-ui,sans-serif;color:#111;max-width:720px;margin:32px auto;padding:0 16px}
  h1{font-size:18px;margin:0 0 4px} h2{font-size:13px;margin:18px 0 4px;text-transform:uppercase;letter-spacing:.04em;color:#555}
  .key{color:#666;font-size:12px}
  table{border-collapse:collapse;width:100%;margin-top:12px}
  th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
  th{width:180px;background:#f7f7f7;font-weight:600}
  p{white-space:pre-wrap;margin:0}
  @media print{body{margin:0}}
</style></head><body>
<div class="key">${esc(i.key)}</div>
<h1>${esc(i.title)}</h1>
<table>
  ${row("Type", i.type)}
  ${row("Priority", i.priority)}
  ${row("Status", i.status)}
  ${row("Environment", i.environment)}
  ${row("Platform", i.platform)}
  ${row("Reporter", i.reporter?.name)}
  ${row("Assignee", i.assignee?.name)}
  ${row("Created", fmtDateTime(i.createdAt))}
  ${row("Resolved", fmtDateTime(i.resolvedAt))}
</table>
${section("Description", i.description)}
${section("Steps to reproduce", i.steps)}
${section("Expected result", i.expectedResult)}
${section("Actual result", i.actualResult)}
${pm ? `<h2>Postmortem</h2>
${section("Root cause", pm.rootCause)}
${section("Resolution", pm.resolution)}
${section("Impact", pm.impact)}
${section("Prevention", pm.prevention)}
<p class="key">By ${esc(pm.resolvedBy?.name)} · ${esc(fmtDateTime(pm.resolvedAt))}</p>` : ""}
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}
