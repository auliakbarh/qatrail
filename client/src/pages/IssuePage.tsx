import { useEffect } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { ISSUE } from "../graphql/issue";
import { drillPath } from "../store/nav";

// Deep-link target for /issues/:id — the canonical issue URL used by notifications,
// Discord and JIRA comments. Resolves the issue's project/feature/test-case chain and
// redirects to the full drilldown URL, carrying `?from=` so the breadcrumb keeps its
// origin. If the issue was deleted (query resolves to null), shows a not-found state.
export default function IssuePage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data, loading, error } = useQuery(ISSUE, { variables: { id }, fetchPolicy: "cache-and-network" });

  useEffect(() => {
    const i = data?.issue;
    if (!i) return;
    const path = drillPath({
      projectId: i.projectId,
      featureId: i.featureId,
      testCaseId: i.testCaseId,
      issueId: i.id,
    });
    const search = params.toString();
    navigate(search ? `${path}?${search}` : path, { replace: true });
  }, [data, navigate, params]);

  const notFound = error || (!loading && !data?.issue);
  if (notFound) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/30 px-4 text-center">
        <h1 className="text-lg font-semibold">{t("issuePage.notFoundTitle")}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {t("issuePage.notFoundText")}
        </p>
        <Link to="/" className="text-xs text-primary underline underline-offset-2 hover:text-primary/80">
          {t("nf.back")}
        </Link>
      </div>
    );
  }
  return <div className="p-6 text-sm text-muted-foreground">{t("issuePage.loading")}</div>;
}
