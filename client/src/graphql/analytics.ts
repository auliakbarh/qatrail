import { gql } from "@apollo/client";

export const ANALYTICS = gql`
  query Analytics($projectId: ID, $featureId: ID, $from: String, $to: String) {
    analytics(projectId: $projectId, featureId: $featureId, from: $from, to: $to) {
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
      keyCoverage { featureId projectId name percent passed total min ready }
    }
  }
`;
