import { useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { UI_VERSION } from "../config";

// Documentation-style help page: sticky table of contents + long-form sections.
const SECTION_IDS = [
  "overview",
  "flow",
  "usecases",
  "roles",
  "start",
  "structure",
  "navigation",
  "approval",
  "import",
  "records",
  "issues",
  "app-tests",
  "session-tests",
  "user-tests",
  "defect-bug",
  "workflow",
  "sla",
  "analytics",
  "notifications",
  "jira",
  "settings",
  "account",
  "glossary",
  "roadmap",
  "faq",
];

export default function Help() {
  const { t } = useTranslation();
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
          {t("help.doc")}
        </div>
        <nav className="flex flex-col gap-0.5">
          {SECTION_IDS.map((id) => (
            <button
              key={id}
              onClick={() => go(id)}
              className={`rounded px-2 py-1 text-left text-xs transition-colors ${
                active === id ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(`help.sec.${id}`)}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <article className="mx-auto max-w-3xl px-6 py-8 md:px-10">
          <header className="mb-8 border-b border-border pb-6">
            <h1 className="text-2xl font-semibold">{t("help.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("help.subtitle", { v: UI_VERSION })}
            </p>
          </header>

          <Doc id="overview" title={t("help.sec.overview")}>
            <P><Trans i18nKey="help.overview.p1" components={{ b: <B /> }} /></P>
            <P>{t("help.overview.p2")}</P>
          </Doc>

          <Doc id="flow" title={t("help.sec.flow")}>
            <P>{t("help.flow.p1")}</P>
            <Pre>{t("help.flow.main")}</Pre>
            <P><Trans i18nKey="help.flow.p2" components={{ b: <B />, code: <Code /> }} /></P>
            <Pre>{t("help.flow.entry")}</Pre>
            <P><Trans i18nKey="help.flow.p3" components={{ b: <B /> }} /></P>
            <Pre>{t("help.flow.approval")}</Pre>
          </Doc>

          <Doc id="usecases" title={t("help.sec.usecases")}>
            <P>{t("help.usecases.p1")}</P>
            <Table
              head={[t("help.usecases.head.want"), t("help.usecases.head.path")]}
              rows={[
                [t("help.usecases.u1"), t("help.usecases.u1p")],
                [t("help.usecases.u2"), t("help.usecases.u2p")],
                [t("help.usecases.u3"), t("help.usecases.u3p")],
                [t("help.usecases.u4"), t("help.usecases.u4p")],
                [t("help.usecases.u5"), t("help.usecases.u5p")],
                [t("help.usecases.u6"), t("help.usecases.u6p")],
                [t("help.usecases.u7"), t("help.usecases.u7p")],
                [t("help.usecases.u8"), t("help.usecases.u8p")],
              ]}
            />
            <Callout><Trans i18nKey="help.usecases.callout" components={{ b: <B /> }} /></Callout>
          </Doc>

          <Doc id="roles" title={t("help.sec.roles")}>
            <Table
              head={[t("help.roles.head.role"), t("help.roles.head.can")]}
              rows={[
                ["SUPER_ADMIN", t("help.roles.superadmin")],
                ["ADMIN", t("help.roles.admin")],
                ["QA_LEAD", t("help.roles.qalead")],
                ["QA", t("help.roles.qa")],
                ["ENGINEER", t("help.roles.engineer")],
                ["VIEWER", t("help.roles.viewer")],
              ]}
            />
            <P>{t("help.roles.p")}</P>
          </Doc>

          <Doc id="start" title={t("help.sec.start")}>
            <Ol
              items={[
                t("help.start.1"),
                t("help.start.2"),
                t("help.start.3"),
                t("help.start.4"),
              ]}
            />
          </Doc>

          <Doc id="structure" title={t("help.sec.structure")}>
            <P><Trans i18nKey="help.structure.p1" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.structure.p2" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.structure.p3" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.structure.p4" components={{ b: <B />, code: <Code /> }} /></P>
            <P><Trans i18nKey="help.structure.p5" components={{ b: <B /> }} /></P>
          </Doc>

          <Doc id="navigation" title={t("help.sec.navigation")}>
            <P><Trans i18nKey="help.nav.p1" components={{ b: <B />, code: <Code /> }} /></P>
            <P><Trans i18nKey="help.nav.p2" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.nav.p3" components={{ b: <B />, code: <Code /> }} /></P>
            <P><Trans i18nKey="help.nav.p4" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.nav.p5" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.nav.p6" components={{ b: <B /> }} /></P>
          </Doc>

          <Doc id="approval" title={t("help.sec.approval")}>
            <P><Trans i18nKey="help.approval.p1" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.approval.p2" components={{ b: <B /> }} /></P>
            <Table
              head={[t("help.approval.head.creator"), t("help.approval.head.approver")]}
              rows={[
                ["QA", t("help.approval.r1")],
                ["QA_LEAD", t("help.approval.r2")],
                ["ADMIN", t("help.approval.r3")],
                ["SUPER_ADMIN", t("help.approval.r4")],
              ]}
            />
            <P><Trans i18nKey="help.approval.p3" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.approval.p360" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.approval.p4" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.approval.p5" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.approval.p6" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.approval.p7" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.approval.p8" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.approval.p9" components={{ b: <B /> }} /></P>
            <Callout><Trans i18nKey="help.approval.callout" components={{ b: <B /> }} /></Callout>
          </Doc>

          <Doc id="import" title={t("help.sec.import")}>
            <P><Trans i18nKey="help.import.p1" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.import.p2" components={{ b: <B />, code: <Code /> }} /></P>
            <P><Trans i18nKey="help.import.p3" components={{ b: <B /> }} /></P>
            <Callout><Trans i18nKey="help.import.callout" components={{ b: <B /> }} /></Callout>
          </Doc>

          <Doc id="records" title={t("help.sec.records")}>
            <P><Trans i18nKey="help.records.p1" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.records.p2" components={{ b: <B /> }} /></P>
            <Callout><Trans i18nKey="help.records.callout" components={{ b: <B /> }} /></Callout>
            <P><Trans i18nKey="help.records.bulk" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.records.scope" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.attachments" components={{ b: <B /> }} /></P>
          </Doc>

          <Doc id="issues" title={t("help.sec.issues")}>
            <P><Trans i18nKey="help.issues.p1" components={{ b: <B /> }} /></P>
            <P>{t("help.issues.p2")}</P>
            <P><Trans i18nKey="help.issues.p3" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.issues.p4" components={{ b: <B /> }} /></P>
          </Doc>

          <Doc id="app-tests" title={t("help.sec.app-tests")}>
            <P><Trans i18nKey="help.apptest.p1" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.apptest.p2" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.apptest.p3" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.apptest.p4" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.apptest.p5" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.apptest.builds" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.apptest.review" components={{ b: <B /> }} /></P>
            <Callout><Trans i18nKey="help.apptest.callout" components={{ b: <B /> }} /></Callout>
          </Doc>

          <Doc id="session-tests" title={t("help.sec.session-tests")}>
            <P><Trans i18nKey="help.session.p1" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.session.p2" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.session.p3" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.session.p4" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.session.p5" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.session.review" components={{ b: <B /> }} /></P>
            <Callout><Trans i18nKey="help.session.callout" components={{ b: <B /> }} /></Callout>
          </Doc>

          <Doc id="user-tests" title={t("help.sec.user-tests")}>
            <P><Trans i18nKey="help.usertest.p1" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.usertest.p2" components={{ b: <B /> }} /></P>
            <Callout><Trans i18nKey="help.usertest.callout" components={{ b: <B /> }} /></Callout>
          </Doc>

          <Doc id="defect-bug" title={t("help.sec.defect-bug")}>
            <P>{t("help.defectbug.p1")}</P>
            <P><Trans i18nKey="help.defectbug.p2" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.defectbug.p3" components={{ b: <B /> }} /></P>
            <Table
              head={[t("help.defectbug.head.aspect"), t("help.defectbug.head.defect"), t("help.defectbug.head.bug")]}
              rows={[
                [t("help.defectbug.r1a"), t("help.defectbug.r1b"), t("help.defectbug.r1c")],
                [t("help.defectbug.r2a"), t("help.defectbug.r2b"), t("help.defectbug.r2c")],
                [t("help.defectbug.r3a"), t("help.defectbug.r3b"), t("help.defectbug.r3c")],
                [t("help.defectbug.r4a"), t("help.defectbug.r4b"), t("help.defectbug.r4c")],
              ]}
            />
            <Callout><Trans i18nKey="help.defectbug.callout" components={{ b: <B /> }} /></Callout>
          </Doc>

          <Doc id="workflow" title={t("help.sec.workflow")}>
            <P>{t("help.workflow.p1")}</P>
            <Pre>{t("help.workflow.pre")}</Pre>
            <P><Trans i18nKey="help.workflow.p2" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.workflow.bulkRetest" components={{ b: <B /> }} /></P>
          </Doc>

          <Doc id="sla" title={t("help.sec.sla")}>
            <P><Trans i18nKey="help.sla.p1" components={{ b: <B /> }} /></P>
            <Table
              head={[t("help.sla.head.priority"), t("help.sla.head.respond"), t("help.sla.head.resolve")]}
              rows={[
                ["HIGH", t("help.sla.high.respond"), t("help.sla.high.resolve")],
                ["MEDIUM", t("help.sla.medium.respond"), t("help.sla.medium.resolve")],
                ["LOW", t("help.sla.low.respond"), t("help.sla.low.resolve")],
              ]}
            />
            <P>{t("help.sla.p2")}</P>
          </Doc>

          <Doc id="analytics" title={t("help.sec.analytics")}>
            <P><Trans i18nKey="help.analytics.p1" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.analytics.p2" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.analytics.p3" components={{ b: <B /> }} /></P>
            <Callout><Trans i18nKey="help.analytics.callout" components={{ b: <B /> }} /></Callout>
          </Doc>

          <Doc id="notifications" title={t("help.sec.notifications")}>
            <P>{t("help.notifications.p1")}</P>
          </Doc>

          <Doc id="jira" title={t("help.sec.jira")}>
            <P><Trans i18nKey="help.jira.p1" components={{ b: <B /> }} /></P>
            <P><Trans i18nKey="help.jira.p2" components={{ b: <B /> }} /></P>
          </Doc>

          <Doc id="settings" title={t("help.sec.settings")}>
            <P>{t("help.settings.p1")}</P>
            <Ul
              items={[
                t("help.settings.1"),
                t("help.settings.2"),
                t("help.settings.3"),
                t("help.settings.4"),
                t("help.settings.5"),
                t("help.settings.6"),
              ]}
            />
            <P>{t("help.settings.p2")}</P>
          </Doc>

          <Doc id="account" title={t("help.sec.account")}>
            <P>{t("help.account.p1")}</P>
          </Doc>

          <Doc id="glossary" title={t("help.sec.glossary")}>
            <P>{t("help.glossary.p")}</P>
            <Dl
              items={Array.from({ length: 31 }, (_, k) => {
                const n = k + 1;
                return [t(`help.gl.${n}.term`), t(`help.gl.${n}.def`)] as [string, string];
              })}
            />
          </Doc>

          <Doc id="roadmap" title={t("help.sec.roadmap")}>
            <P>{t("help.roadmap.p1")}</P>
            <Table
              head={[t("help.roadmap.head.item"), t("help.roadmap.head.status"), t("help.roadmap.head.why")]}
              rows={Array.from({ length: 8 }, (_, k) => {
                const n = k + 1;
                return [t(`help.roadmap.${n}.item`), t(`help.roadmap.${n}.status`), t(`help.roadmap.${n}.why`)];
              })}
            />
            <Callout>{t("help.roadmap.note")}</Callout>
          </Doc>

          <Doc id="faq" title={t("help.sec.faq")}>
            <Faq q={t("help.faq.q1")}>
              <Trans i18nKey="help.faq.a1" components={{ code: <Code /> }} />
            </Faq>
            <Faq q={t("help.faq.q2")}>
              {t("help.faq.a2")}
            </Faq>
            <Faq q={t("help.faq.q3")}>
              {t("help.faq.a3")}
            </Faq>
            <Faq q={t("help.faq.q4")}>
              {t("help.faq.a4")}
            </Faq>
            <Faq q={t("help.faq.q5")}>
              {t("help.faq.a5")}
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
function B({ children }: { children?: any }) {
  return <b className="font-semibold text-foreground">{children}</b>;
}
function Code({ children }: { children?: any }) {
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
