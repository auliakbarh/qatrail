import { fmtDateTimeTz as fmtDateTime } from "./utils";

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

// Analytics snapshot as a print/PDF page: same native-print route as the other
// two reports, so there is still no PDF library in the build.
export function printAnalyticsReport(a: any, meta: { scope: string; range: string; printedBy: string }) {
  const th = (cells: string[]) => `<tr>${cells.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const td = (cells: any[]) => `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`;
  const mins = (m: number | null) => (m == null ? "—" : m < 60 ? `${m}m` : m < 1440 ? `${(m / 60).toFixed(1)}h` : `${(m / 1440).toFixed(1)}d`);
  // Features grouped by project, matching the on-screen table.
  const byProject = new Map<string, any[]>();
  for (const k of a.keyCoverage ?? []) {
    const name = k.projectName ?? k.projectId;
    byProject.set(name, [...(byProject.get(name) ?? []), k]);
  }

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Analytics — ${esc(meta.scope)}</title>
<style>
  body{font:13px/1.5 system-ui,sans-serif;color:#111;max-width:900px;margin:32px auto;padding:0 16px}
  h1{font-size:18px;margin:0 0 4px} h2{font-size:13px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.04em;color:#555}
  h3{font-size:12px;margin:14px 0 4px}
  .key{color:#666;font-size:12px}
  table{border-collapse:collapse;width:100%;margin-top:8px}
  th,td{border:1px solid #ddd;padding:5px 8px;text-align:left;vertical-align:top}
  th{background:#f7f7f7;font-weight:600}
  .stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
  .stat{border:1px solid #ddd;padding:6px 10px;min-width:120px}
  .stat b{display:block;font-size:18px}
  @media print{body{margin:0}}
</style></head><body>
<div class="key">${esc(meta.range)}</div>
<h1>Analytics — ${esc(meta.scope)}</h1>

<h2>Summary</h2>
<div class="stats">
  <div class="stat"><b>${esc(a.totalFindings)}</b>Findings</div>
  <div class="stat"><b>${esc(a.totalDefects)}</b>Defects</div>
  <div class="stat"><b>${esc(a.totalBugs)}</b>Bugs</div>
  <div class="stat"><b>${esc(a.resolutionRate)}%</b>Resolved</div>
  <div class="stat"><b>${esc(mins(a.avgResolveMins))}</b>Avg resolve</div>
  <div class="stat"><b>${a.slaCompliance == null ? "—" : esc(a.slaCompliance) + "%"}</b>SLA</div>
  <div class="stat"><b>${esc(a.confidence?.percent)}%</b>Confidence (${esc(a.confidence?.passed)}/${esc(a.confidence?.total)})</div>
</div>

<h2>Issue status</h2>
<table><thead>${th(["Status", "Count"])}</thead><tbody>
${(a.statusBreakdown ?? []).map((s: any) => td([s.status, s.count])).join("") || td(["—", "—"])}
</tbody></table>

<h2>SLA</h2>
<table><thead>${th(["Met", "At risk", "Breached"])}</thead><tbody>
${td([a.slaBreakdown?.met, a.slaBreakdown?.atRisk, a.slaBreakdown?.breached])}
</tbody></table>

<h2>Created vs resolved</h2>
<table><thead>${th(["Period", "Created", "Resolved"])}</thead><tbody>
${(a.createdVsResolved ?? []).map((m: any) => td([m.period, m.created, m.resolved])).join("") || td(["—", "—", "—"])}
</tbody></table>

<h2>Key coverage</h2>
${
  byProject.size === 0
    ? "<p>—</p>"
    : [...byProject]
        .map(
          ([project, rows]) => `<h3>${esc(project)}</h3>
<table><thead>${th(["Feature", "Pass %", "Min %", "Passed", "Ready"])}</thead><tbody>
${rows.map((k: any) => td([k.name, `${k.percent}%`, `${k.min}%`, `${k.passed}/${k.total}`, k.ready ? "Yes" : "No"])).join("")}
</tbody></table>`,
        )
        .join("")
}

<h2>Work by person</h2>
${
  (() => {
    // Same split as the screen: each role only gets the columns that mean
    // something for it, so no table is mostly blank.
    const cols: Record<string, [string, string][]> = {
      QA_LEAD: [["approvals", "Approvals"], ["testCasesCreated", "Test cases"], ["recordsRun", "Runs"], ["issuesReported", "Reported"]],
      QA: [["testCasesCreated", "Test cases"], ["recordsRun", "Runs"], ["issuesReported", "Reported"]],
      ENGINEER: [["appTestsSubmitted", "App tests"], ["issuesAssigned", "Assigned"], ["issuesResolved", "Resolved"], ["avgResolveMins", "Avg resolve"]],
      ADMIN: [["approvals", "Approvals"], ["testCasesCreated", "Test cases"], ["recordsRun", "Runs"], ["issuesReported", "Reported"], ["issuesResolved", "Resolved"]],
    };
    cols.SUPER_ADMIN = cols.ADMIN;
    cols.VIEWER = [];
    const order = ["QA_LEAD", "QA", "ENGINEER", "ADMIN", "SUPER_ADMIN", "VIEWER"];
    const byRole = new Map<string, any[]>();
    for (const w of a.workload ?? []) byRole.set(w.role, [...(byRole.get(w.role) ?? []), w]);
    const roles = [...byRole.keys()].sort((x, y) => order.indexOf(x) - order.indexOf(y));
    if (!roles.length) return "<p>—</p>";
    return roles
      .map((role) => {
        const c = cols[role] ?? cols.QA;
        return `<h3>${esc(role)}</h3>
<table><thead>${th(["Person", ...c.map(([, label]) => label)])}</thead><tbody>
${byRole
  .get(role)!
  .map((w: any) => td([w.name, ...c.map(([key]) => (key === "avgResolveMins" ? mins(w[key]) : w[key]))]))
  .join("")}
</tbody></table>`;
      })
      .join("");
  })()
}

<p class="key" style="margin-top:20px">Printed by ${esc(meta.printedBy)} · ${esc(fmtDateTime(new Date().toISOString()))}</p>
</body></html>`;

  print(html);
}
