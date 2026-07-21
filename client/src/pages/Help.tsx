import { useState } from "react";
import { UI_VERSION } from "../config";

// Documentation-style help page: sticky table of contents + long-form sections.
const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "roles", label: "Roles & access" },
  { id: "start", label: "Getting started" },
  { id: "structure", label: "Projects, features, test cases" },
  { id: "records", label: "Test records & coverage" },
  { id: "issues", label: "Issues" },
  { id: "defect-bug", label: "Defect vs Bug" },
  { id: "workflow", label: "Issue workflow" },
  { id: "sla", label: "SLA" },
  { id: "analytics", label: "Analytics" },
  { id: "notifications", label: "Notifications" },
  { id: "jira", label: "JIRA integration" },
  { id: "settings", label: "Settings & admin" },
  { id: "account", label: "Account & password" },
  { id: "glossary", label: "Glossary" },
  { id: "faq", label: "FAQ" },
];

export default function Help() {
  const [active, setActive] = useState("overview");
  const go = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* TOC */}
      <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-border p-4 lg:block">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
          Documentation
        </div>
        <nav className="flex flex-col gap-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => go(s.id)}
              className={`rounded px-2 py-1 text-left text-xs transition-colors ${
                active === s.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <article className="mx-auto max-w-3xl px-6 py-8 md:px-10">
          <header className="mb-8 border-b border-border pb-6">
            <h1 className="text-2xl font-semibold">QA Reporting — User Guide</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              How the app is organized and how to run the QA workflow end to end. UI v{UI_VERSION}.
            </p>
          </header>

          <Doc id="overview" title="Overview">
            <P>
              QA Reporting organizes testing as a hierarchy — <B>Project → Feature → Test Case</B> — and turns
              failed tests into tracked <B>Issues</B> that flow through an engineer review workflow with SLA
              tracking, postmortems, and analytics.
            </P>
            <P>The left panel is navigation: the project tree, Dashboard, Analytics, Settings, and Help.
              Data lists open in the main area; forms open in a right-side panel (never a pop-up).</P>
          </Doc>

          <Doc id="roles" title="Roles & access">
            <Table
              head={["Role", "Can do"]}
              rows={[
                ["SUPER_ADMIN", "Everything, including managing admins. Seeded from the environment."],
                ["ADMIN", "All features + user/maintenance/SLA/Discord settings. Cannot manage super admins."],
                ["QA", "Manage projects, features, test cases, records; raise, review, archive issues."],
                ["ENGINEER", "Act on assigned issues: accept, reject, need-clarify, solve (postmortem)."],
              ]}
            />
            <P>Accounts are created by an admin. New users get a generated default password and must change it
              on first login.</P>
          </Doc>

          <Doc id="start" title="Getting started">
            <Ol
              items={[
                "Sign in with your email + password (an admin creates your account).",
                "On first login you'll be asked to set a new password.",
                "Pick a project in the sidebar tree, or open Dashboard to see all projects.",
                "Drill down: Project → Feature → Test Case.",
              ]}
            />
          </Doc>

          <Doc id="structure" title="Projects, features, test cases">
            <P><B>Project</B> — an app/system. Holds features and a minimum pass % target.</P>
            <P><B>Feature / Module</B> — a slice of a project. Holds test cases and its own minimum pass %.</P>
            <P><B>Test Case</B> — name, description, precondition, ordered steps (each with an optional expected
              result), attachments (paste URLs), and a note.</P>
            <P>Use the <B>Add</B> button in each list header. Edit/delete via the row actions. Deleting cascades
              to everything beneath it — you must type <Code>DELETE</Code> to confirm.</P>
          </Doc>

          <Doc id="records" title="Test records & coverage">
            <P>Open a test case and add a <B>Record Test</B> (PASS/FAIL) under the Records tab. The executor and
              time are captured automatically; attach URLs if needed.</P>
            <P>A test case counts as <B>passed</B> when its most recent record is PASS <B>and</B> it has no open
              issue (any issue not yet CLOSED and not archived). So an unresolved issue keeps a test case out of
              the pass count even if its last run was green. <B>Pass %</B> for a feature/project = passed test
              cases ÷ total. A level is <B>Ready</B> when its pass % meets the minimum you set.</P>
            <Callout>Saving a <B>FAIL</B> record immediately opens a prefilled Issue form.</Callout>
          </Doc>

          <Doc id="issues" title="Issues">
            <P>An issue is a <B>Defect</B> (blocks release) or a <B>Bug</B> (fix later / production). Fields
              include environment, platform (app version required for iOS/Android), test account (password stored
              encrypted), steps to reproduce, actual vs expected result, priority, attachments, and an assignee
              (an engineer).</P>
            <P>Open an issue from the Issues tab to see its detail, timeline, and available actions.</P>
          </Doc>

          <Doc id="defect-bug" title="Defect vs Bug">
            <P>Both are findings from testing, but they carry different consequences — pick the right type when
              you raise an issue.</P>
            <P><B>Defect</B> — found during testing and <B>should block</B> the Story/Task from being deployed.
              Think of it as a sub-task of the original work: while it's open, the story isn't done.</P>
            <P><B>Bug</B> — found during testing but <B>not blocking</B> (minor, can be fixed later), or found in
              the live production system (by a customer or by us). It sits at the same level as a Story/Task and
              is tracked and reported on separately.</P>
            <Table
              head={["Aspect", "Defect", "Bug"]}
              rows={[
                ["Blocks release?", "Yes — must be fixed first", "No — backlog / fix later"],
                ["Typical origin", "Testing, pre-deploy", "Minor issue, or found in production"],
                ["Relationship", "Sub-task of the story/task", "Same level as a story/task"],
                ["Severity feel", "Higher — gates the release", "Lower — scheduled separately"],
              ]}
            />
            <Callout>Rule of thumb: <B>if it must be fixed before this release ships, it's a Defect;</B> if it
              can wait, it's a Bug.</Callout>
          </Doc>

          <Doc id="workflow" title="Issue workflow">
            <P>Every transition is recorded in the issue timeline.</P>
            <Pre>{`QA creates ................. OPEN
Engineer:
  accept ................... IN_PROGRESS
  need clarification ....... back to QA (respond → re-queued)
  reject (reason) .......... QA can archive or recreate
Engineer solves (postmortem) NEED_REVIEW
QA reviews:
  approve .................. CLOSED
  reopen ................... REOPENED → engineer
Hold / Resume ............. pause & resume IN_PROGRESS`}</Pre>
            <P><B>Postmortem</B> (root cause, resolution, impact, prevention) is filled by the engineer on
              solve and visible to QA on the issue.</P>
          </Doc>

          <Doc id="sla" title="SLA">
            <P>SLA applies to <B>production</B> issues only. Targets are per priority and admin-editable
              (Settings → SLA). Default targets:</P>
            <Table
              head={["Priority", "Respond within", "Resolve within"]}
              rows={[
                ["HIGH", "1 hour", "4 hours"],
                ["MEDIUM", "4 hours", "24 hours"],
                ["LOW", "—", "72 hours"],
              ]}
            />
            <P>Breaches notify the assignee; overall compliance is shown in Analytics.</P>
          </Doc>

          <Doc id="analytics" title="Analytics">
            <P>Totals (defects vs bugs), resolution rate, average resolve time, SLA compliance, a created-vs-
              resolved trend, status breakdown, and confidence/coverage per feature. Scope it to <B>all</B>, a
              <B> project</B>, or a <B>feature</B>.</P>
          </Doc>

          <Doc id="notifications" title="Notifications">
            <P>The bell (top-left) shows live updates: engineers are notified when assigned; QA is notified on
              reject and need-clarify; assignees on SLA breaches. Click a notification to mark it read.</P>
          </Doc>

          <Doc id="jira" title="JIRA integration">
            <P>On an issue, <B>Copy link</B> copies a deep link. When JIRA is configured, <B>Post to JIRA</B>
              adds a formatted comment (with the issue link + all fields) to a ticket key you enter; re-posting
              edits the same comment.</P>
          </Doc>

          <Doc id="settings" title="Settings & admin">
            <P>Everyone can change their password. Admins also get:</P>
            <Ul
              items={[
                "Users — create/edit/delete accounts, reset a user's password.",
                "Maintenance — lock out non-admins with a message.",
                "SLA targets — edit respond/resolve minutes per priority.",
                "Discord — webhook + toggle; broadcasts every project action (test-send available).",
              ]}
            />
          </Doc>

          <Doc id="account" title="Account & password">
            <P>Passwords need ≥9 characters with upper- and lower-case, a number, and a symbol. Forgot yours?
              Use the link on the sign-in page — you'll get a reset email (valid 1 hour, single use).</P>
          </Doc>

          <Doc id="glossary" title="Glossary">
            <P>Terms used in QA work and throughout this app.</P>
            <Dl
              items={[
                ["Project / App", "The top-level system under test. Contains features and a minimum pass % target."],
                ["Feature / Module", "A slice of a project. Groups related test cases with its own pass % target."],
                ["Test Case", "A documented scenario: precondition, ordered steps, and expected results."],
                ["Precondition", "The state that must hold before the steps are executed."],
                ["Step / Expected Result", "One action to perform and the outcome it should produce."],
                ["Record Test (Test Run)", "One execution of a test case with a PASS/FAIL result, executor, and time."],
                ["Steps to Reproduce", "The exact sequence that triggers an issue, so an engineer can reproduce it."],
                ["Actual vs Expected Result", "What happened vs what should have happened — the core of any issue."],
                ["Defect", "A blocking finding: prevents the story/task from being deployed until fixed."],
                ["Bug", "A non-blocking finding (minor, or found in production); tracked separately from stories."],
                ["Issue", "A raised Defect or Bug, with fields, workflow status, and an assignee."],
                ["Severity / Priority", "How urgent an issue is. Here: LOW, MEDIUM, HIGH — drives SLA."],
                ["Environment", "Where testing happened: STAGING or PRODUCTION. SLA applies to production."],
                ["Platform", "WEB, ANDROID, or IOS. App version is required for the mobile platforms."],
                ["Reporter", "The QA who raised the issue."],
                ["Assignee", "The engineer responsible for resolving the issue."],
                ["Review state", "The engineer's response: PENDING, ACCEPTED, NEED_CLARIFY, or REJECTED."],
                ["Status", "Lifecycle: OPEN → IN_PROGRESS → NEED_REVIEW → CLOSED, plus REOPENED and HOLD."],
                ["Reopen", "QA sends a solved issue back to the engineer because it isn't actually fixed."],
                ["Regression", "A previously working feature that breaks again — often caught by re-running test cases."],
                ["Postmortem", "The engineer's write-up on solving: root cause, resolution, impact, prevention."],
                ["Root Cause", "The underlying reason an issue occurred (not just the symptom)."],
                ["Pass %", "Passed ÷ total, where a test case passes if its latest record is PASS and it has no open issue."],
                ["Coverage", "How much of a feature/project has been validated by passing test cases."],
                ["Confidence / Ready", "A level is Ready when its pass % meets the configured minimum."],
                ["SLA", "Service Level Agreement: target respond and resolve times for production issues."],
                ["Respond / Resolve time", "Time from creation to first engineer action / to resolution."],
                ["Squad", "The team owning a project (also derivable from a JIRA key prefix, e.g. ATH-901 → ATH)."],
                ["Archive", "Hide an issue from active lists (e.g. after rejection) without deleting it."],
                ["Recreate", "Start a new issue prefilled from a rejected one, keeping a link to the original."],
                ["Attachment", "A supporting file referenced by URL (screenshot, video, doc, log)."],
              ]}
            />
          </Doc>

          <Doc id="faq" title="FAQ">
            <Faq q="A delete is blocked — why?">
              Deletes cascade; confirm by typing <Code>DELETE</Code>. If you lack the role, ask an admin.
            </Faq>
            <Faq q="I can't act on an issue.">
              Engineer actions require you to be the assignee; QA actions require you to be the reporter or have
              a QA/admin role.
            </Faq>
            <Faq q="Microsoft sign-in is greyed out.">
              SSO is prepared but not yet enabled on this server.
            </Faq>
          </Doc>
        </article>
      </div>
    </div>
  );
}

/* — doc primitives — */
function Doc({ id, title, children }: { id: string; title: string; children: any }) {
  return (
    <section id={id} className="mb-10 scroll-mt-6">
      <h2 className="mb-3 border-b border-border pb-1.5 text-lg font-semibold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
function P({ children }: { children: any }) {
  return <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>;
}
function B({ children }: { children: any }) {
  return <b className="font-semibold text-foreground">{children}</b>;
}
function Code({ children }: { children: any }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">{children}</code>;
}
function Pre({ children }: { children: any }) {
  return (
    <pre className="overflow-x-auto rounded border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-foreground">
      {children}
    </pre>
  );
}
function Callout({ children }: { children: any }) {
  return (
    <div className="rounded border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      💡 {children}
    </div>
  );
}
function Ul({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}
function Ol({ items }: { items: string[] }) {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ol>
  );
}
function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              {r.map((c, j) => (
                <td key={j} className={j === 0 ? "px-3 py-2 font-medium" : "px-3 py-2 text-muted-foreground"}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Dl({ items }: { items: [string, string][] }) {
  return (
    <dl className="divide-y divide-border/60 rounded border border-border">
      {items.map(([term, def]) => (
        <div key={term} className="grid grid-cols-1 gap-1 px-3 py-2 sm:grid-cols-[10rem_1fr] sm:gap-3">
          <dt className="text-sm font-medium text-foreground">{term}</dt>
          <dd className="text-sm text-muted-foreground">{def}</dd>
        </div>
      ))}
    </dl>
  );
}
function Faq({ q, children }: { q: string; children: any }) {
  return (
    <div>
      <div className="text-sm font-medium">{q}</div>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
