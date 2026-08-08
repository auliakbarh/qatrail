import { useQuery } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { RightPanel } from "../../components/RightPanel";
import { AttachmentList } from "../../components/AttachmentList";
import { TEST_CASE } from "../../graphql/hierarchy";
import { useNav } from "../../store/nav";
import { Skeleton } from "../../components/Skeleton";

// Read-only test case, shown beside an issue so QA/engineers can check the steps
// a finding came from without navigating away.
export function TestCaseViewPanel({ testCaseId }: { testCaseId: string }) {
  const { t } = useTranslation();
  const { closePanel, openPanel } = useNav();

  return (
    <RightPanel title={t("iss.testCase")} onClose={closePanel}>
      <TestCaseView
        testCaseId={testCaseId}
        onOpenText={(a) => openPanel({ kind: "attachment", mode: "create", initial: a })}
      />
    </RightPanel>
  );
}

// The body on its own — the bulk run panel shows it in a modal, where swapping
// the right panel for an attachment viewer would throw away the verdicts typed
// so far, so `onOpenText` is left off there.
export function TestCaseView({ testCaseId, onOpenText }: { testCaseId: string; onOpenText?: (a: any) => void }) {
  const { t } = useTranslation();
  const { data, loading } = useQuery(TEST_CASE, { variables: { id: testCaseId } });
  const tc = data?.testCase;

  return (
    <>
      {loading && !tc && (
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      )}
      {!loading && !tc && <p className="text-sm text-muted-foreground">{t("c.notFound")}</p>}
      {tc && (
        <div className="space-y-4 text-sm">
          <div>
            <div className="font-mono text-xs text-muted-foreground">{tc.key}</div>
            <h4 className="font-semibold">{tc.name}</h4>
            {tc.kind && <div className="mt-1 text-xs text-muted-foreground">{tc.kind}</div>}
          </div>
          {tc.description && <p className="whitespace-pre-wrap text-muted-foreground">{tc.description}</p>}
          {tc.precondition && (
            <div>
              <div className="mb-0.5 font-medium">{t("tc.precondition")}</div>
              <p className="whitespace-pre-wrap text-muted-foreground">{tc.precondition}</p>
            </div>
          )}
          <div>
            <div className="mb-1 font-medium">{t("tc.steps")}</div>
            {tc.steps.length === 0 && <div className="text-xs text-muted-foreground">{t("tc.noSteps")}</div>}
            <ol className="space-y-1.5">
              {tc.steps.map((s: any) => (
                <li key={s.id} className="text-xs">
                  <span className="font-medium">{s.order}.</span> {s.step}
                  {s.expectedResult && (
                    <div className="pl-4 text-muted-foreground">→ {t("tc.expected")}: {s.expectedResult}</div>
                  )}
                </li>
              ))}
            </ol>
          </div>
          {tc.attachments.length > 0 && (
            <div>
              <div className="mb-1 font-medium">{t("c.attachments")}</div>
              <AttachmentList items={tc.attachments} onOpenText={onOpenText} />
            </div>
          )}
          {tc.note && (
            <div>
              <div className="mb-0.5 font-medium">{t("c.note")}</div>
              <p className="whitespace-pre-wrap text-muted-foreground">{tc.note}</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
