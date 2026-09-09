#!/usr/bin/env node
// Drive the running app in a real browser and report what a user would hit.
//
//   npm run dev                     # in another terminal
//   node scripts/ui-check.mjs       # all checks
//   node scripts/ui-check.mjs nav   # one check by name
//   HEADED=1 node scripts/ui-check.mjs nav
//
// Uses the Chrome already installed on the machine (playwright-core +
// channel: "chrome"), so there is no browser download to keep in sync.
// Credentials come from server/.env — never hardcode them here.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";

const API = process.env.API_URL ?? "http://localhost:4000/graphql";
const APP = process.env.APP_URL ?? "http://localhost:5173";
const TOKEN_KEY = "qar_token"; // client/src/config.ts
const SHOTS = process.env.SHOT_DIR ?? "/tmp/qatrail-ui-check";

const env = (name) => {
  const line = readFileSync(new URL("../server/.env", import.meta.url), "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} missing from server/.env`);
  return line.slice(name.length + 1).replace(/^"|"$/g, "");
};

const gql = async (query, variables = {}, token) => {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
};

// ---------------------------------------------------------------- reporting
const problems = [];
const fail = (where, what) => {
  problems.push(`${where}: ${what}`);
  console.log(`  ✗ ${what}`);
};
const pass = (what) => console.log(`  ✓ ${what}`);

// Console errors and dead requests are the cheapest bug sweep there is: they
// catch a crashed render or a broken query on a page nobody thought to assert.
function watch(page, where) {
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // A failed GraphQL mutation we deliberately trigger would show up here too;
    // nothing in this script does that, so every error is unexpected.
    fail(where, `console error: ${text.slice(0, 300)}`);
  });
  page.on("pageerror", (e) => fail(where, `uncaught: ${String(e).slice(0, 300)}`));
  page.on("requestfailed", (r) => {
    const url = r.url();
    if (url.startsWith("ws://") || url.startsWith("wss://")) return; // subscriptions retry by design
    fail(where, `request failed: ${r.failure()?.errorText} ${url.slice(0, 160)}`);
  });
  page.on("response", async (r) => {
    if (!r.url().includes("/graphql")) return;
    if (r.status() >= 400) fail(where, `graphql HTTP ${r.status()}`);
  });
}

const shot = async (page, name) => {
  mkdirSync(SHOTS, { recursive: true });
  const path = `${SHOTS}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  return path;
};

// Wait for the app shell rather than a fixed sleep: the sidebar only renders
// once `me` has resolved, which is also when the page is really usable.
const ready = (page) => page.waitForSelector("aside, nav", { timeout: 15000 });

// ------------------------------------------------------------------- checks
const checks = {};

// The bug that started this: the picker used to snap back to the URL's project
// whenever it was changed from inside a drilldown.
checks.nav = async (page, ctx) => {
  const { projects } = ctx;
  const a = projects[0];
  const b = projects[1];

  await page.goto(`${APP}/projects/${a.id}`);
  await ready(page);
  const picker = page.locator("aside select, nav select").first();

  if ((await picker.inputValue()) !== a.id) fail("nav", "picker does not follow the URL's project on load");
  else pass("picker follows the URL on load");

  // Pick another project while inside a drilldown.
  await picker.selectOption(b.id);
  await page.waitForTimeout(600);
  const after = await picker.inputValue();
  if (after !== b.id) fail("nav", `picker snapped back after picking another project (value=${after}, wanted ${b.id})`);
  else pass("picker holds the new project (the reported bug)");
  if (!page.url().includes(b.id)) fail("nav", `page did not follow the picker (url=${page.url()})`);
  else pass("page followed the picker");

  // "All projects" from inside a drilldown.
  await picker.selectOption("");
  await page.waitForTimeout(600);
  if ((await picker.inputValue()) !== "") fail("nav", "picker snapped back after choosing All projects");
  else pass("All projects holds");
  const url = new URL(page.url());
  if (url.pathname !== "/") fail("nav", `All projects did not land on the project list (path=${url.pathname})`);
  else pass("All projects lands on the project list");

  // From a page with no project in the URL the picker must only scope the tree.
  await page.goto(`${APP}/app-tests`);
  await ready(page);
  await page.locator("aside select, nav select").first().selectOption(b.id);
  await page.waitForTimeout(600);
  if (!page.url().includes("/app-tests")) fail("nav", `picker dragged the user off /app-tests (url=${page.url()})`);
  else pass("picker does not hijack navigation off a list page");

  await shot(page, "nav");
};

// Foldering: category groups in the sidebar, folder column + group-by in the list.
checks.folder = async (page, ctx) => {
  const { demo } = ctx;
  if (!demo) return console.log("  – skipped: no demo project with categories/folders");

  await page.goto(`${APP}/projects/${demo.id}`);
  await ready(page);
  const aside = page.locator("aside, nav").first();
  // The feature branch arrives on its own query — assert after it lands, or the
  // skeleton is what gets checked.
  for (const label of ["UI", "API"]) {
    try {
      await aside.getByText(label, { exact: true }).first().waitFor({ timeout: 8000 });
      pass(`sidebar shows the ${label} group`);
    } catch {
      fail("folder", `sidebar has no "${label}" category group`);
    }
  }

  // Feature list: the Category column and its group-by.
  const body = page.locator("table").first();
  if ((await body.count()) === 0) fail("folder", "no feature table rendered");
  const head = await page.locator("table thead").first().innerText();
  if (!/categ|kategori/i.test(head)) fail("folder", `feature table has no Category column (head=${head.replace(/\s+/g, " ")})`);
  else pass("feature table has a Category column");

  await shot(page, "folder-features");

  // Drill into a feature and check the folder column + group-by.
  const feature = ctx.features.find((f) => f.category);
  await page.goto(`${APP}/projects/${demo.id}/features/${feature.id}`);
  await ready(page);
  await page.waitForTimeout(400);
  const tcHead = await page.locator("table thead").first().innerText();
  if (!/folder/i.test(tcHead)) fail("folder", `test case table has no Folder column (head=${tcHead.replace(/\s+/g, " ")})`);
  else pass("test case table has a Folder column");

  // Target the group-by select by the option value it owns, not by its text: a
  // project named "…foldering" makes the sidebar picker match /folder/i too.
  const groupSel = page.locator('select:has(option[value="folderLabel"])').first();
  if ((await groupSel.count()) === 0) fail("folder", "no group-by offering Folder");
  else {
    await groupSel.selectOption("folderLabel");
    await page.waitForTimeout(500);
    const grouped = await page.locator("table tbody").first().innerText();
    // Group headers are the folder names plus a count.
    if (!/Cashback/.test(grouped)) fail("folder", "grouping by Folder shows no folder header");
    else pass("grouping by Folder renders folder headers");
  }
  await shot(page, "folder-cases");
};

// A record's JIRA ticket has to reach the test case's Records tab.
checks.record = async (page, ctx) => {
  const { demo, tcWithRecord } = ctx;
  if (!tcWithRecord) return console.log("  – skipped: no test case with a record");
  await page.goto(`${APP}/test-cases/${tcWithRecord.id}`);
  await ready(page);
  await page.waitForTimeout(800);
  const text = await page.locator("body").innerText();
  if (!text.includes("CAI-730")) fail("record", "the run's JIRA ticket is not shown on the test case");
  else pass("run's JIRA ticket shown on the test case");
  await shot(page, "record");
};

// Session table: two note columns, the Jira filter, and the runs table.
checks.session = async (page, ctx) => {
  const { session } = ctx;
  if (!session) return console.log("  – skipped: no session test");
  await page.goto(`${APP}/session-tests/${session.id}`);
  await ready(page);
  await page.waitForTimeout(1000);
  const text = await page.locator("body").innerText();
  for (const want of ["CAI-730", "CAI-731"]) {
    if (!text.includes(want)) fail("session", `session page does not show ticket ${want}`);
    else pass(`session page shows ${want}`);
  }
  if (!/last run note|note run terakhir/i.test(text)) fail("session", "no Last run note column");
  else pass("Last run note column present");
  await shot(page, "session");
};

// Analytics reads the sidebar's project and shows it as a label, not a select.
checks.analytics = async (page, ctx) => {
  const { projects } = ctx;
  await page.goto(`${APP}/projects/${projects[0].id}`);
  await ready(page);
  await page.goto(`${APP}/analytics`);
  await ready(page);
  await page.waitForTimeout(1200);
  const text = await page.locator("body").innerText();
  if (!text.includes(projects[0].name)) fail("analytics", `scope label does not name the chosen project (${projects[0].name})`);
  else pass("scope label names the chosen project");
  await shot(page, "analytics");
};

// Phase E: approving a report closes the round's open findings. Needs peer
// review switched on and two identities (a report is never reviewed by the QA
// who submitted it), so this check builds its own fixture and puts the setting
// back in a finally — a check that leaves the deployment in review mode is worse
// than no check.
checks.review = async (page, ctx) => {
  const { token, demo } = ctx;
  if (!demo) return console.log("  – skipped: no demo project");

  const before = (await gql(`{ setting { testReviewMode } }`, {}, token)).setting.testReviewMode;
  const temp = { email: `ui-check-qa+${Date.now()}@test.local`, name: "UI check QA" };
  let qaId = null;
  let appTestId = null;
  let issueId = null;

  try {
    await gql(`mutation($i:SettingInput!){ updateSetting(input:$i){ testReviewMode } }`, { i: { testReviewMode: "PEER_360" } }, token);

    // The QA who runs the round and submits the report — never the reviewer.
    const created = (await gql(
      `mutation($i:UserInput!){ createUser(input:$i){ user { id } defaultPassword } }`,
      { i: { email: temp.email, name: temp.name, role: "QA", active: true } },
      token,
    )).createUser;
    qaId = created.user.id;
    const qaToken = (await gql(
      `mutation($e:String!,$p:String!){ login(email:$e,password:$p){ token } }`,
      { e: temp.email, p: created.defaultPassword },
    )).login.token;

    const feature = (await gql(`query($p:ID!){ features(projectId:$p){ id category } }`, { p: demo.id }, token)).features.find((f) => f.category);
    const tc = (await gql(`query($f:ID!){ testCases(featureId:$f){ id key } }`, { f: feature.id }, token)).testCases[0];
    ctx.tcId = tc.id; // the teardown has to unassign it before the app test can go

    appTestId = (await gql(
      `mutation($i:AppTestInput!){ createAppTest(input:$i){ id key } }`,
      { i: { projectId: demo.id, environment: "STAGING", platform: "ANDROID", kind: "FEATURE", appVersion: "9.9.9", downloadLink: "https://example.test/build", note: "ui-check fixture", jiraTickets: ["CAI-730"] } },
      token,
    )).createAppTest.id;
    await gql(`mutation($a:ID!,$t:[ID!]!){ assignTestCases(appTestId:$a,testCaseIds:$t){ id } }`, { a: appTestId, t: [tc.id] }, token);

    const engineer = (await gql(`{ engineers { id } }`, {}, token)).engineers[0];
    issueId = (await gql(
      `mutation($i:IssueInput!){ createIssue(input:$i){ id key status } }`,
      { i: {
        testCaseId: tc.id, type: "DEFECT", title: "ui-check finding", description: "fixture",
        environment: "STAGING", platform: "ANDROID", appVersion: "9.9.9", testAccount: "a", testedAt: new Date().toISOString(),
        steps: "s", actualResult: "a", expectedResult: "e", priority: "LOW",
        assigneeId: engineer.id, appTestId, attachments: [],
      } },
      token,
    )).createIssue.id;

    // Hand the report over as the QA who ran it.
    await gql(`mutation($id:ID!){ submitAppTestReview(id:$id){ id reviewState } }`, { id: appTestId }, qaToken);

    // --- the part a person does ---
    await page.goto(`${APP}/app-tests/${appTestId}`);
    await ready(page);
    await page.waitForTimeout(1200);
    const approve = page.getByRole("button", { name: /approve/i }).first();
    if ((await approve.count()) === 0) return fail("review", "no Approve button on a report waiting for review");
    pass("report waiting for review offers Approve");

    await approve.click();
    await page.waitForTimeout(500);
    const dialog = await page.locator("body").innerText();
    if (!/still open will be closed|masih terbuka akan ditutup/i.test(dialog))
      fail("review", "the confirmation does not say the findings will be closed");
    else pass("confirmation warns that open findings are closed");
    // JIRA_DONE_TRANSITION is unset here, so the confirmation must not promise a
    // ticket move. This is the safety property, asserted rather than assumed.
    if (/moved to done|digeser ke done/i.test(dialog))
      fail("review", "confirmation promises a JIRA move while jiraAutoDone is false");
    else pass("confirmation stays silent about JIRA when the transition is unset");
    await shot(page, "review-confirm");

    // The dialog's own Approve is the second one on the page (header + footer).
    await page.getByRole("button", { name: /approve/i }).last().click();
    await page.waitForTimeout(2000);

    const after = await gql(
      `query($a:ID!,$i:ID!){ appTest(id:$a){ reviewState status } issue(id:$i){ status closedAt history { kind toVal } } }`,
      { a: appTestId, i: issueId },
      token,
    );
    if (after.appTest.reviewState !== "APPROVED") fail("review", `reviewState is ${after.appTest.reviewState}, not APPROVED`);
    else pass("report reaches APPROVED");
    if (after.issue.status !== "CLOSED") fail("review", `the finding is ${after.issue.status}, not CLOSED`);
    else pass("approving closed the round's open finding");
    if (!after.issue.closedAt) fail("review", "closed finding has no closedAt");
    if (!after.issue.history.some((h) => h.toVal === "CLOSED")) fail("review", "no timeline entry naming the close");
    else pass("the close left a timeline entry");
    await shot(page, "review-done");
  } finally {
    // Always: the deployment goes back to how it was, and the fixture leaves.
    // Order matters — the setting first, because a report still under review can
    // read as PASSED, and deleteAppTest only accepts an app test that is OPEN.
    // Failures here are reported, never swallowed: silent cleanup that doesn't
    // clean is how a "passing" check litters someone's database.
    const cleanup = async (label, query, variables) => {
      try {
        await gql(query, variables, token);
      } catch (err) {
        fail("review", `cleanup ${label} failed: ${String(err).slice(0, 200)}`);
      }
    };
    await cleanup("restore setting", `mutation($i:SettingInput!){ updateSetting(input:$i){ testReviewMode } }`, { i: { testReviewMode: before } });
    const restored = (await gql(`{ setting { testReviewMode } }`, {}, token)).setting.testReviewMode;
    if (restored !== before) fail("review", `testReviewMode left as ${restored}, should be ${before}`);
    else pass(`testReviewMode restored to ${before}`);

    if (issueId) await cleanup("delete issue", `mutation($id:ID!){ deleteIssue(id:$id) }`, { id: issueId });
    if (appTestId && ctx.tcId) {
      // An app test with assignments is not OPEN, and only an OPEN one deletes.
      await cleanup("unassign", `mutation($a:ID!,$t:ID!){ unassignTestCase(appTestId:$a,testCaseId:$t){ id status } }`, { a: appTestId, t: ctx.tcId });
    }
    if (appTestId) await cleanup("delete app test", `mutation($id:ID!){ deleteAppTest(id:$id) }`, { id: appTestId });
    if (qaId) await cleanup("delete temp QA", `mutation($id:ID!){ deleteUser(id:$id) }`, { id: qaId });
    pass("fixture removed");
  }
};

// Every page a user can reach, purely to collect console errors.
checks.pages = async (page) => {
  const routes = ["/", "/app-tests", "/session-tests", "/user-testing", "/issues", "/approvals", "/analytics", "/settings", "/help"];
  for (const r of routes) {
    await page.goto(`${APP}${r}`);
    await ready(page);
    await page.waitForTimeout(900);
    pass(`visited ${r}`);
  }
  await shot(page, "pages-last");
};

// --------------------------------------------------------------------- main
const only = process.argv[2];
const token = (
  await gql(
    `mutation($e:String!,$p:String!){ login(email:$e,password:$p){ token } }`,
    { e: env("SUPER_ADMIN_EMAIL"), p: env("SUPER_ADMIN_PASSWORD") },
  )
).login.token;

const { projects } = await gql(`{ projects { id key name } }`, {}, token);
const demo = projects.find((p) => p.name.startsWith("ZZ demo")) ?? null;
let features = [];
let tcWithRecord = null;
let session = null;
if (demo) {
  features = (await gql(`query($p:ID!){ features(projectId:$p){ id key name category } }`, { p: demo.id }, token)).features;
  const ui = features.find((f) => f.category);
  if (ui) {
    const cases = (await gql(`query($f:ID!){ testCases(featureId:$f){ id key name folder } }`, { f: ui.id }, token)).testCases;
    for (const c of cases) {
      const recs = (await gql(`query($t:ID!){ recordTests(testCaseId:$t){ key jiraKey } }`, { t: c.id }, token)).recordTests;
      if (recs.some((r) => r.jiraKey)) { tcWithRecord = c; break; }
    }
  }
  const sessions = (await gql(`query($p:ID){ sessionTests(projectId:$p){ id key } }`, { p: demo.id }, token)).sessionTests;
  session = sessions[0] ?? null;
}
const ctx = { token, projects, demo, features, tcWithRecord, session };

const browser = await chromium.launch({ channel: "chrome", headless: !process.env.HEADED });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// Seed the token the way a real sign-in would, so every page starts authed.
await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [TOKEN_KEY, token]);

for (const [name, run] of Object.entries(checks)) {
  if (only && only !== name) continue;
  console.log(`\n▸ ${name}`);
  const page = await context.newPage();
  watch(page, name);
  try {
    await run(page, ctx);
  } catch (err) {
    fail(name, `threw: ${String(err).split("\n")[0]}`);
  }
  await page.close();
}
await browser.close();

console.log(`\nscreenshots: ${SHOTS}`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
console.log("\nno problems found");
