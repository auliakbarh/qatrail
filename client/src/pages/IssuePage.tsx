import { useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { ISSUE } from "../graphql/issue";
import { useNav } from "../store/nav";

// Deep-link target for /issues/:id. Resolves the issue's project/feature/test-case
// chain, primes nav, and redirects into the dashboard drilldown. If the issue was
// deleted (query resolves to null), shows a not-found state instead of hanging.
export default function IssuePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useQuery(ISSUE, { variables: { id }, fetchPolicy: "cache-and-network" });

  useEffect(() => {
    const i = data?.issue;
    if (!i) return;
    useNav.setState({
      projectId: i.projectId,
      featureId: i.featureId,
      testCaseId: i.testCaseId,
      issueId: i.id,
      panel: null,
    });
    navigate("/", { replace: true });
  }, [data, navigate]);

  const notFound = error || (!loading && !data?.issue);
  if (notFound) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/30 px-4 text-center">
        <h1 className="text-lg font-semibold">Issue not found</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This issue doesn't exist or has been deleted.
        </p>
        <Link to="/" className="text-xs text-primary underline underline-offset-2 hover:text-primary/80">
          Back to dashboard
        </Link>
      </div>
    );
  }
  return <div className="p-6 text-sm text-muted-foreground">Loading issue…</div>;
}
