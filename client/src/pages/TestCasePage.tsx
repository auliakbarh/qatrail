import { useEffect } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { gql } from "@apollo/client";
import { drillPath } from "../store/nav";

// Test cases live inside the drilldown, whose URL needs project + feature ids —
// but a notification or the pending list only knows the case id. This resolves
// the chain and redirects, same shape as IssuePage. One deep link for every
// entry point.
const TEST_CASE_CHAIN = gql`
  query TestCaseChain($id: ID!) {
    testCase(id: $id) {
      id
      feature { id project { id } }
    }
  }
`;

export default function TestCasePage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data, loading, error } = useQuery(TEST_CASE_CHAIN, { variables: { id }, fetchPolicy: "cache-and-network" });

  useEffect(() => {
    const tc = data?.testCase;
    if (!tc) return;
    const path = drillPath({
      projectId: tc.feature.project.id,
      featureId: tc.feature.id,
      testCaseId: tc.id,
    });
    // Default the breadcrumb origin to the pending list — that's where this
    // route is reached from unless the caller said otherwise.
    const search = params.toString() || "from=pending";
    navigate(`${path}?${search}`, { replace: true });
  }, [data, navigate, params]);

  const notFound = error || (!loading && !data?.testCase);
  if (notFound) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/30 px-4 text-center">
        <h1 className="text-lg font-semibold">{t("tcPage.notFoundTitle")}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t("tcPage.notFoundText")}</p>
        <Link to="/approvals" className="text-xs text-primary underline underline-offset-2 hover:text-primary/80">
          {t("tca.title")}
        </Link>
      </div>
    );
  }
  return <div className="p-6 text-sm text-muted-foreground">{t("issuePage.loading")}</div>;
}
