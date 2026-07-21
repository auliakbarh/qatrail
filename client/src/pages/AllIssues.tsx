import { useQuery } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { ISSUES } from "../graphql/issue";
import { IssueTable } from "../components/IssueTable";

export default function AllIssues() {
  const { t } = useTranslation();
  const { data, loading } = useQuery(ISSUES, { fetchPolicy: "cache-and-network" });
  return (
    <div className="h-full space-y-4 overflow-y-auto p-6">
      <div className="rounded border border-border">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">{t("issue.all")}</h2>
        </div>
        <div className="px-5 py-4">
          <IssueTable issues={data?.issues ?? []} loading={loading} showPeople />
        </div>
      </div>
    </div>
  );
}
