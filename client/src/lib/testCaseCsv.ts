// Bulk test-case CSV: headers, template, export-row builder, and parser.
// Shared shape so export and import round-trip. Uses downloadCsv (lib/csv.ts) to
// write; parsing is a tiny RFC4180 reader (no deps).
import { downloadCsv } from "./csv";

export type Scope = "project" | "feature";

const TC_COLS = ["Name", "Description", "Precondition", "Note", "Folder", "Kind", "Step", "Expected Result"] as const;
// Category is a property of the feature, so it only appears at project scope —
// the scope where a missing feature is created from the file.
export const headersFor = (scope: Scope): string[] =>
  scope === "project" ? ["Feature", "Category", ...TC_COLS] : [...TC_COLS];
// Columns a file may leave out entirely — they were added after the first
// exports went out, and a missing one just means "unfiled".
const OPTIONAL_COLS: string[] = ["Category", "Folder"];

// One test case = its first row (all fields) + continuation rows for extra steps
// (Name blank, only Step/Expected Result filled).
export interface ImportStep {
  step: string;
  expectedResult: string | null;
}
export interface ImportTestCase {
  feature?: string | null;
  category?: string | null;
  name: string;
  description: string | null;
  precondition: string | null;
  note: string | null;
  folder: string | null;
  kind: string | null;
  steps: ImportStep[];
}

// Export shape from the exportTestCases query.
interface ExportTC {
  featureName: string;
  category?: string | null;
  name: string;
  description: string | null;
  precondition: string | null;
  note: string | null;
  folder?: string | null;
  kind: string | null;
  steps: { step: string; expectedResult: string | null }[];
}

function tcToRows(tc: ExportTC, scope: Scope): (string | null)[][] {
  const lead = scope === "project" ? [tc.featureName, tc.category ?? ""] : [];
  const steps = tc.steps.length ? tc.steps : [{ step: "", expectedResult: "" }];
  // A continuation row is blank except for the two step columns; counting the
  // headers beats hand-counting the blanks every time a column is added.
  const blanks = Array(headersFor(scope).length - 2).fill("");
  return steps.map((s, i) =>
    i === 0
      ? [...lead, tc.name, tc.description, tc.precondition, tc.note, tc.folder ?? "", tc.kind, s.step, s.expectedResult]
      : [...blanks, s.step, s.expectedResult],
  );
}

export function exportTestCasesCsv(filename: string, testCases: ExportTC[], scope: Scope) {
  const rows = testCases.flatMap((tc) => tcToRows(tc, scope));
  downloadCsv(filename, headersFor(scope), rows);
}

export function downloadTemplate(scope: Scope) {
  // Two example test cases: one with two steps (shows continuation), one minimal.
  const ex: ExportTC[] =
    scope === "project"
      ? [
          { featureName: "Login", category: "UI", name: "Valid login", description: "User logs in with correct credentials", precondition: "Registered user", note: "", folder: "Sign in", kind: "POSITIVE", steps: [{ step: "Open login page", expectedResult: "Login form shown" }, { step: "Enter valid creds and submit", expectedResult: "Redirected to dashboard" }] },
          { featureName: "Login", category: "UI", name: "Empty password", description: "", precondition: "", note: "", folder: "Sign in", kind: "NEGATIVE", steps: [{ step: "Submit with empty password", expectedResult: "Validation error shown" }] },
        ]
      : [
          { featureName: "", name: "Valid login", description: "User logs in with correct credentials", precondition: "Registered user", note: "", folder: "Sign in", kind: "POSITIVE", steps: [{ step: "Open login page", expectedResult: "Login form shown" }, { step: "Enter valid creds and submit", expectedResult: "Redirected to dashboard" }] },
          { featureName: "", name: "Empty password", description: "", precondition: "", note: "", folder: "Sign in", kind: "NEGATIVE", steps: [{ step: "Submit with empty password", expectedResult: "Validation error shown" }] },
        ];
  exportTestCasesCsv(`testcase-template-${scope}.csv`, ex, scope);
}

// Minimal RFC4180 parser: handles quoted fields with commas/newlines/escaped quotes.
// ponytail: no streaming, whole file in memory — fine for spreadsheet-sized uploads.
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Excel on a locale whose list separator is ";" (id-ID, most of Europe) saves
  // semicolon-separated files with a .csv name. Pick the delimiter from the header
  // line — headers are plain words, so a plain count is enough.
  const head = src.split("\n", 1)[0];
  const delim = [",", ";", "\t"].reduce((a, b) => (head.split(b).length > head.split(a).length ? b : a));
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  // flush last field/row unless the file ended on a clean newline
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Parse a CSV file into grouped test cases. Returns { rows } on success or { error }
// for a structural problem (wrong/missing headers, empty, orphan step row).
export function parseImport(text: string, scope: Scope): { rows: ImportTestCase[] } | { error: string } {
  const grid = parseCsvText(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (!grid.length) return { error: "File is empty" };
  const expected = headersFor(scope);
  const header = grid[0].map((h) => h.trim().toLowerCase());
  // The grouping columns are optional in a file: a CSV exported before they
  // existed must still import. Everything else is still required.
  const want = expected.filter((h) => !OPTIONAL_COLS.includes(h)).map((h) => h.toLowerCase());
  const missing = want.filter((h) => !header.includes(h));
  if (missing.length) return { error: `Missing column(s): ${missing.join(", ")}. Expected: ${expected.join(", ")}` };
  const idx = (name: string) => header.indexOf(name.toLowerCase());
  const at = (r: string[], name: string) => (r[idx(name)] ?? "").trim();

  const out: ImportTestCase[] = [];
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i];
    const name = at(r, "Name");
    const step = at(r, "Step");
    const expected_ = at(r, "Expected Result");
    if (name) {
      out.push({
        feature: scope === "project" ? at(r, "Feature") : null,
        category: scope === "project" ? at(r, "Category") || null : null,
        name,
        description: at(r, "Description") || null,
        precondition: at(r, "Precondition") || null,
        note: at(r, "Note") || null,
        folder: at(r, "Folder") || null,
        kind: at(r, "Kind") || null,
        steps: step ? [{ step, expectedResult: expected_ || null }] : [],
      });
    } else if (step) {
      const cur = out[out.length - 1];
      if (!cur) return { error: `Row ${i + 1}: step row has no test case above it (Name is blank)` };
      cur.steps.push({ step, expectedResult: expected_ || null });
    }
    // fully blank rows already filtered out
  }
  if (!out.length) return { error: "No test cases found" };
  return { rows: out };
}
