import { useQuery } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { ASSIGNED_TO_ME } from "../graphql/issue";
import { IssueTable } from "../components/IssueTable";

export default function AssignedToMe() {
  const { t } = useTranslation();
  const { data, loading } = useQuery(ASSIGNED_TO_ME, { fetchPolicy: "cache-and-network" });
  return (
    <div className="h-full space-y-4 overflow-y-auto p-6">
      <div className="rounded border border-border">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">{t("issue.assigned")}</h2>
        </div>
        <div className="px-5 py-4">
          <IssueTable issues={data?.assignedToMe ?? []} loading={loading} />
        </div>
      </div>
    </div>
  );
}
