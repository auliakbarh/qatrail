import { gql } from "@apollo/client";

export const ANALYTICS = gql`
  query Analytics($projectId: ID, $featureId: ID) {
    analytics(projectId: $projectId, featureId: $featureId) {
      totalFindings
      totalDefects
      totalBugs
      resolutionRate
      avgResolveMins
      slaCompliance
      confidence { total passed percent }
      statusBreakdown { status count }
      slaBreakdown { met atRisk breached }
      createdVsResolved { period created resolved }
      keyCoverage { name percent passed total ready }
    }
  }
`;
