export default function Help() {
  return (
    <div className="h-full space-y-4 overflow-y-auto p-6">
      <div className="rounded border border-border">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Help</h2>
        </div>
        <div className="space-y-4 px-5 py-4 text-sm">
          <Section title="Structure">
            Work is organized as <b>Project → Feature → Test Case</b>. Open a project to see its features, a
            feature to see its test cases, and a test case to record test runs and raise issues.
          </Section>
          <Section title="Testing">
            Add a <b>Record Test</b> (PASS/FAIL) on a test case. A FAIL opens a prefilled <b>Issue</b> form.
            Pass % per feature/project is computed from the latest record of each test case.
          </Section>
          <Section title="Issue workflow">
            QA raises an issue (OPEN). The assigned engineer can Accept, Reject (with reason), or ask for
            clarification. On Accept it moves to IN_PROGRESS; Solve fills a postmortem and moves it to
            NEED_REVIEW. QA then Approves (CLOSED) or Reopens.
          </Section>
          <Section title="Analytics">
            The Analytics page shows totals, resolution rate, average resolve time, SLA compliance
            (production), and coverage — scoped to all, a project, or a feature.
          </Section>
          <Section title="Account">
            Change your password under Settings. Forgot it? Use the link on the sign-in page.
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <div>
      <div className="mb-0.5 font-medium">{title}</div>
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}
