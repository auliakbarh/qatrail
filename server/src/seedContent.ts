import { prisma } from "./db.js";
import { env } from "./env.js";
import { logger } from "./logger.js";

const log = logger.child({ mod: "seed-content" });

// QATrail's own feature/test-case catalogue, expressed as seed data. Running
// this wipes all project-domain rows (KEEPS users, settings, SLA targets) and
// recreates the QATrail project with its modules and detailed test cases.

type Step = { step: string; expectedResult?: string };
type TC = { name: string; description?: string; precondition?: string; note?: string; steps: Step[] };
type Feat = { name: string; description: string; cases: TC[] };

const FEATURES: Feat[] = [
  {
    name: "Authentication & Session",
    description: "Login, logout, forced password change, single active session, and brute-force lockout.",
    cases: [
      {
        name: "Login with valid credentials",
        description: "A registered active user can sign in.",
        precondition: "An active user account exists.",
        steps: [
          { step: "Open the login page", expectedResult: "Email + password form is shown" },
          { step: "Enter valid email and password, submit", expectedResult: "Redirected to the dashboard" },
        ],
      },
      {
        name: "Login rejected for wrong password",
        steps: [
          { step: "Enter a valid email with a wrong password, submit", expectedResult: "Generic 'Invalid email or password' error" },
        ],
      },
      {
        name: "Account lockout after repeated failures",
        description: "Five failed attempts within the window locks the account temporarily.",
        steps: [
          { step: "Submit a wrong password 5 times", expectedResult: "6th attempt shows a 'too many attempts, try again in N minutes' error" },
          { step: "Wait for the lock to expire and log in correctly", expectedResult: "Login succeeds" },
        ],
      },
      {
        name: "Forced password change on first login",
        precondition: "A user created by an admin with mustChangePassword = true.",
        steps: [
          { step: "Log in with the initial password", expectedResult: "The change-password screen is forced before any other page" },
          { step: "Set a policy-compliant new password", expectedResult: "Access to the app is granted" },
        ],
      },
      {
        name: "Single active session enforced",
        description: "Logging in on a new device invalidates the previous session.",
        steps: [
          { step: "Log in on device A, then log in on device B with the same account", expectedResult: "Device A's next request is rejected / logged out" },
        ],
      },
    ],
  },
  {
    name: "User Management",
    description: "Admin CRUD of users, role assignment, activation, and password reset.",
    cases: [
      {
        name: "Create a new user",
        precondition: "Signed in as ADMIN or SUPER_ADMIN.",
        steps: [
          { step: "Open Settings → Users → add user", expectedResult: "User form opens in the right panel" },
          { step: "Fill name/email/role and save", expectedResult: "User appears in the list with mustChangePassword set" },
        ],
      },
      {
        name: "Reset a user's password copies default to clipboard",
        steps: [
          { step: "Click reset password on a user row", expectedResult: "A generated password is copied and shown in a toast" },
          { step: "Log in as that user with the shown password", expectedResult: "Login works, then forces a password change" },
        ],
      },
      {
        name: "Deactivate a user blocks login",
        steps: [
          { step: "Set a user to inactive and save", expectedResult: "That user can no longer log in" },
        ],
      },
      {
        name: "Non-admin cannot access user management",
        precondition: "Signed in as QA or ENGINEER.",
        steps: [
          { step: "Attempt to open the Users tab / action", expectedResult: "Action is disabled and shows an access-denied toast" },
        ],
      },
    ],
  },
  {
    name: "Project & Feature Management",
    description: "CRUD, cloning, and moving of projects and features/modules.",
    cases: [
      {
        name: "Create a project",
        steps: [
          { step: "Create a project with a name and min pass %", expectedResult: "Project appears in the sidebar tree" },
        ],
      },
      {
        name: "Clone a project with its structure",
        description: "Cloning copies features and test cases but not records or issues.",
        steps: [
          { step: "Clone an existing project", expectedResult: "A new project '… (copy)' with the same features/test cases and no records/issues" },
        ],
      },
      {
        name: "Move a feature to another project",
        steps: [
          { step: "Move a feature into a different project", expectedResult: "Feature and its test cases appear under the target project" },
        ],
      },
      {
        name: "Delete a project cascades",
        steps: [
          { step: "Delete a project", expectedResult: "Its features, test cases, records, and issues are removed" },
        ],
      },
    ],
  },
  {
    name: "Test Case Management",
    description: "Test cases with ordered steps, cloning, and moving across features/projects.",
    cases: [
      {
        name: "Create a test case with steps",
        steps: [
          { step: "Add a test case with name and several ordered steps", expectedResult: "Test case is saved with a TC-<n> key and its steps" },
        ],
      },
      {
        name: "Clone a test case",
        steps: [
          { step: "Clone a test case", expectedResult: "A copy is created without records or issues" },
        ],
      },
      {
        name: "Move a test case across projects",
        steps: [
          { step: "Move a test case to a feature in another project", expectedResult: "It appears under the target feature" },
        ],
      },
    ],
  },
  {
    name: "Test Records",
    description: "Recording PASS/FAIL executions with attachments and retest linkage.",
    cases: [
      {
        name: "Record a PASS result",
        precondition: "A test case exists.",
        steps: [
          { step: "Record a test with result PASS", expectedResult: "Record gets a REC-<n> key; coverage reflects the pass" },
        ],
      },
      {
        name: "Record a FAIL and raise an issue",
        steps: [
          { step: "Record a FAIL result", expectedResult: "Record saved; option to create a linked issue" },
          { step: "Create the issue from the failed record", expectedResult: "Issue is linked to the record; test case is not counted as passed" },
        ],
      },
      {
        name: "Attach an image/video to a record",
        steps: [
          { step: "Add an image and a video attachment", expectedResult: "Image previews inline; video can be played and downloaded" },
        ],
      },
    ],
  },
  {
    name: "Issue Tracking & Workflow",
    description: "The engineer review state machine: accept, reject, clarify, solve, hold, resume, review, reopen.",
    cases: [
      {
        name: "Engineer accepts an open issue",
        precondition: "An OPEN issue assigned to the engineer.",
        steps: [
          { step: "Engineer clicks Accept", expectedResult: "Status → IN_PROGRESS; respond SLA clock stops" },
        ],
      },
      {
        name: "Engineer solves; QA reviews and closes",
        steps: [
          { step: "Engineer solves with a postmortem", expectedResult: "Status → NEED_REVIEW" },
          { step: "QA reviews and passes", expectedResult: "Status → CLOSED with closedAt set" },
        ],
      },
      {
        name: "QA reopens a solved issue on review-fail",
        steps: [
          { step: "QA reviews and fails", expectedResult: "Status → REOPENED and the engineer is notified" },
        ],
      },
      {
        name: "QA reopens a closed issue",
        steps: [
          { step: "QA reopens a CLOSED issue", expectedResult: "Status → REOPENED" },
        ],
      },
      {
        name: "Engineer requests clarification",
        steps: [
          { step: "Engineer requests clarification with a note", expectedResult: "Reporter is notified; review = NEED_CLARIFY" },
        ],
      },
    ],
  },
  {
    name: "Issue Comments & Collaboration",
    description: "Threaded discussion on an issue with notifications to the other party.",
    cases: [
      {
        name: "Add a comment optimistically",
        steps: [
          { step: "Post a comment on an issue", expectedResult: "Comment appears instantly; the other party gets a COMMENT notification" },
        ],
      },
      {
        name: "Copy issue link",
        steps: [
          { step: "Click copy link on an issue", expectedResult: "The issue URL is copied with a confirmation toast" },
        ],
      },
    ],
  },
  {
    name: "SLA & Notifications",
    description: "SLA classification, breach notifications, and the notification bell.",
    cases: [
      {
        name: "SLA status shown per issue",
        steps: [
          { step: "Open an All Issues list", expectedResult: "Each issue shows an SLA status (met / at-risk / breached)" },
        ],
      },
      {
        name: "Breach notification fires once",
        description: "The scheduler notifies on breach and does not re-fire after a restart.",
        steps: [
          { step: "Let a production issue exceed its resolve SLA", expectedResult: "Assignee receives one SLA_RESOLVE notification" },
          { step: "Restart the server", expectedResult: "No duplicate breach notification is sent" },
        ],
      },
      {
        name: "Notification bell shows unread and all",
        steps: [
          { step: "Toggle 'show only unread' / 'show all' in the bell", expectedResult: "The list filters accordingly; clicking a notification opens its target" },
        ],
      },
    ],
  },
  {
    name: "Analytics & Dashboard",
    description: "Coverage, created-vs-resolved trend, SLA compliance, and key coverage table.",
    cases: [
      {
        name: "Coverage updates without page refresh",
        steps: [
          { step: "Close an open issue, then navigate back up the tree", expectedResult: "Coverage percentages update automatically" },
        ],
      },
      {
        name: "Created vs resolved chart with date range",
        steps: [
          { step: "Open Analytics and set a start/end date range", expectedResult: "The bar chart redraws for the range with tooltips" },
        ],
      },
      {
        name: "Key coverage table is searchable and sortable",
        steps: [
          { step: "Search and sort the key coverage table", expectedResult: "Rows filter/sort; a feature link opens its detail page" },
        ],
      },
    ],
  },
  {
    name: "Settings & Admin",
    description: "Maintenance mode, Discord webhook, SLA targets, and the audit log.",
    cases: [
      {
        name: "Toggle maintenance mode",
        steps: [
          { step: "Enable maintenance mode with a message", expectedResult: "Non-admins see the maintenance screen; admins keep access" },
        ],
      },
      {
        name: "Configure Discord webhook",
        steps: [
          { step: "Set a Discord webhook and send a test", expectedResult: "A formatted test message arrives in Discord" },
        ],
      },
      {
        name: "Edit SLA targets ordered HIGH→LOW",
        steps: [
          { step: "Change a priority's respond/resolve minutes and save", expectedResult: "Saved with a confirmation toast; rows ordered HIGH→LOW" },
        ],
      },
      {
        name: "Audit log records mutations",
        steps: [
          { step: "Create a project, then open Settings → Audit log", expectedResult: "The create action is listed with actor and timestamp" },
        ],
      },
    ],
  },
  {
    name: "Export & Reporting",
    description: "CSV export of issue lists and print/PDF of an issue report.",
    cases: [
      {
        name: "Export issues to CSV",
        steps: [
          { step: "Apply filters in All Issues and export CSV", expectedResult: "A CSV of all matching rows downloads" },
        ],
      },
      {
        name: "Print/PDF an issue postmortem report",
        steps: [
          { step: "Open a solved issue and click Print / PDF", expectedResult: "A formatted report opens and the browser print dialog appears" },
        ],
      },
    ],
  },
  {
    name: "Internationalization & Accessibility",
    description: "Language toggle (en/id), locale-aware dates, and modal accessibility.",
    cases: [
      {
        name: "Switch language en ↔ id",
        steps: [
          { step: "Toggle the language", expectedResult: "All UI text switches; dates format for the locale" },
        ],
      },
      {
        name: "Modal traps focus and restores it",
        steps: [
          { step: "Open a confirmation modal and press Tab repeatedly", expectedResult: "Focus stays within the dialog; Escape closes and focus returns to the opener" },
        ],
      },
    ],
  },
];

// Delete order respects foreign keys (KEEPS user / setting / slaTarget / passwordReset).
async function wipeContent() {
  await prisma.notification.deleteMany();
  await prisma.statusEvent.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.appTestCase.deleteMany();
  await prisma.appTest.deleteMany();
  await prisma.postmortem.deleteMany();
  await prisma.issueAttachment.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.recordTestAttachment.deleteMany();
  await prisma.recordTest.deleteMany();
  await prisma.testCaseAttachment.deleteMany();
  await prisma.testCaseStep.deleteMany();
  await prisma.testCase.deleteMany();
  await prisma.feature.deleteMany();
  await prisma.project.deleteMany();
  await prisma.auditLog.deleteMany();
}

export async function seedContent() {
  const owner =
    (await prisma.user.findUnique({ where: { email: env.superAdminEmail } })) ??
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!owner) throw new Error("No user found — run the base seed first (npm run seed).");

  await wipeContent();

  const project = await prisma.project.create({
    data: {
      name: "QATrail",
      description: "QA test-management app — its own features and test cases.",
      squad: "Platform",
      minPassPercent: 80,
      createdById: owner.id,
    },
  });

  let features = 0;
  let cases = 0;
  for (const f of FEATURES) {
    const feature = await prisma.feature.create({
      data: { projectId: project.id, name: f.name, description: f.description, minPassPercent: 80 },
    });
    features++;
    for (const c of f.cases) {
      await prisma.testCase.create({
        data: {
          featureId: feature.id,
          name: c.name,
          description: c.description ?? null,
          precondition: c.precondition ?? null,
          note: c.note ?? null,
          createdById: owner.id,
          steps: { create: c.steps.map((s, i) => ({ order: i + 1, step: s.step, expectedResult: s.expectedResult ?? null })) },
        },
      });
      cases++;
    }
  }

  log.info({ project: project.name, features, cases }, "content seed complete");
  return { features, cases };
}

// Allow running standalone: `tsx src/seedContent.ts`.
if (import.meta.url === `file://${process.argv[1]}`) {
  seedContent()
    .then(() => prisma.$disconnect())
    .catch(async (err) => {
      log.error({ err }, "content seed failed");
      await prisma.$disconnect();
      process.exit(1);
    });
}
