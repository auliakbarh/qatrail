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

  print(html);
}

function print(html: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

// Sign-off report for a testing session: the verdict against the agreed target,
// what was tested on which app build, what failed, and signature lines for the
// stakeholders. Same native-print route as the issue report — no PDF library.
export function printSessionSignOff(
  s: any,
  apps: any[],
  cases: any[],
  records: any[],
  printedBy: string,
) {
  const row = (label: string, val: any) => `<tr><th>${esc(label)}</th><td>${esc(val)}</td></tr>`;
  const passed = passedVerdict(s);
  const notStarted = cases.filter((c) => c.status === "NOT_STARTED").length;
  const th = (xs: string[]) => `<tr>${xs.map((x) => `<th>${esc(x)}</th>`).join("")}</tr>`;
  const td = (xs: any[]) => `<tr>${xs.map((x) => `<td>${esc(x)}</td>`).join("")}</tr>`;

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(s.key)} — ${esc(s.kindLabel)} sign-off</title>
<style>
  body{font:12px/1.5 system-ui,sans-serif;color:#111;max-width:900px;margin:28px auto;padding:0 16px}
  h1{font-size:18px;margin:0 0 4px} h2{font-size:12px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#555}
  .key{color:#666;font-size:11px}
  table{border-collapse:collapse;width:100%;margin-top:8px}
  th,td{border:1px solid #ddd;padding:5px 7px;text-align:left;vertical-align:top}
  thead th{background:#f7f7f7}
  table.kv th{width:190px;background:#f7f7f7;font-weight:600}
  .verdict{display:inline-block;border:1px solid #111;padding:3px 8px;font-weight:700;letter-spacing:.04em}
  .warn{border:1px solid #b45309;background:#fffbeb;padding:6px 8px;margin-top:8px}
  .sign{margin-top:14px;display:flex;flex-wrap:wrap;gap:18px}
  .sign div{min-width:220px;border-top:1px solid #111;padding-top:4px;margin-top:44px}
  p{white-space:pre-wrap;margin:0}
  @media print{body{margin:0}}
</style></head><body>
<div class="key">${esc(s.key)} · ${esc(s.projectName)}</div>
<h1>${esc(s.kindLabel)} — sign-off report</h1>
<p class="verdict">${passed ? "PASSED" : "NOT PASSED"} — ${esc(s.passPercent)}% of ${esc(s.minPassPercent)}% target</p>
<table class="kv">
  ${row("Test date", fmtDateTime(s.testedAt))}
  ${row("Status", s.status)}
  ${row("Project", s.projectName)}
  ${row("Created by", s.createdBy?.name)}
  ${row("Test cases", `${cases.length} (passed ${cases.filter((c) => c.status === "PASSED").length}, failed ${cases.filter((c) => c.status === "FAILED").length}, blocked ${cases.filter((c) => c.status === "BLOCKED").length}, not run ${notStarted})`)}
  ${row("Findings", s.issueCount)}
  ${row("Stakeholders", (s.stakeholders ?? []).join(", "))}
  ${row("Closed at", s.closedAt ? fmtDateTime(s.closedAt) : "—")}
  ${row("Note", s.note)}
</table>
${notStarted > 0 ? `<p class="warn">This session was closed with ${notStarted} test case(s) never run.</p>` : ""}

<h2>Apps under test</h2>
<table><thead>${th(["App", "App test", "Version FE", "Version BE", "Environment", "Platform", "Note"])}</thead><tbody>
${apps.length === 0 ? td(["—", "—", "—", "—", "—", "—", "—"]) : apps.map((a) => td([a.name, a.appTestKey, a.versionFe, a.versionBe, a.environment, a.platform, a.note])).join("")}
</tbody></table>

<h2>Test cases</h2>
<table><thead>${th(["Key", "Name", "Feature", "Status", "Apps", "Issues", "Done at"])}</thead><tbody>
${cases.map((c) => td([c.testCase?.key, c.testCase?.name, c.featureName, c.status, (c.apps ?? []).map((a: any) => a.name).join(", "), c.issueCount, c.doneTestAt ? fmtDateTime(c.doneTestAt) : "—"])).join("")}
</tbody></table>

<h2>Test runs</h2>
<table><thead>${th(["Record", "Result", "Executed by", "Executed at", "Note"])}</thead><tbody>
${records.length === 0 ? td(["—", "—", "—", "—", "—"]) : records.map((r) => td([r.key, r.result, r.executedBy?.name, fmtDateTime(r.executedAt), r.note])).join("")}
</tbody></table>

${s.summary ? `<h2>Summary</h2><p>${esc(s.summary)}</p>` : ""}

<h2>Sign-off</h2>
<div class="sign">
  <div>${esc(s.createdBy?.name)} — QA</div>
  ${(s.stakeholders ?? []).map((n: string) => `<div>${esc(n)}</div>`).join("")}
</div>
<p class="key" style="margin-top:20px">Printed by ${esc(printedBy)} · ${esc(fmtDateTime(new Date().toISOString()))}</p>
</body></html>`;

  print(html);
}

const passedVerdict = (s: any) => (s?.passPercent ?? 0) >= (s?.minPassPercent ?? 0);
