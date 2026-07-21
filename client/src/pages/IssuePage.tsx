import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { ISSUE } from "../graphql/issue";
import { useNav } from "../store/nav";

// Deep-link target for /issues/:id (the "copy link" URL). Resolves the issue's
// project/feature/test-case chain, primes nav state, and redirects to the
// dashboard where IssueDetail renders inside the normal drilldown.
export default function IssuePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error } = useQuery(ISSUE, { variables: { id }, fetchPolicy: "cache-and-network" });

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

  if (error) return <div className="p-6 text-sm text-destructive">Issue not found.</div>;
  return <div className="p-6 text-sm text-muted-foreground">Loading issue…</div>;
}
