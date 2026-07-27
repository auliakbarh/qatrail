-- One-off backfill for Issue.isProductionIssue (new column, defaults to false).
-- Existing PRODUCTION issues keep their SLA; app-test findings never get one.
-- Run once, after `npm run db:push`:
--   docker compose exec -T db psql -U qar -d qa_reporting < server/prisma/backfill-production-issue.sql
UPDATE "Issue"
SET "isProductionIssue" = true
WHERE environment = 'PRODUCTION' AND "appTestId" IS NULL;
