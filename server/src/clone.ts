import { prisma } from "./db.js";

// Deep-clone helpers. Copies structure (project → feature → test case → steps +
// attachments) but NEVER test records or issues.

export async function cloneTestCaseInto(
  sourceId: string,
  targetFeatureId: string,
  createdById: string,
  nameOverride?: string,
) {
  const src = await prisma.testCase.findUnique({
    where: { id: sourceId },
    include: { steps: true, attachments: true },
  });
  if (!src) throw new Error("Test case not found");
  return prisma.testCase.create({
    data: {
      featureId: targetFeatureId,
      name: nameOverride ?? `${src.name} (copy)`,
      description: src.description,
      precondition: src.precondition,
      note: src.note,
      kind: src.kind,
      createdById,
      // A copy inherits the source's review state: identical content that was
      // already approved needs no second round. It also keeps
      // moveAppTestProject(CLONE) usable — that re-points assignments straight
      // at the copies, and PENDING copies would hand an app test cases nobody
      // may run.
      approval: src.approval,
      reviewedAt: src.reviewedAt,
      reviewedById: src.reviewedById,
      rejectReason: src.rejectReason,
      steps: {
        create: [...src.steps]
          .sort((a, b) => a.order - b.order)
          .map((s) => ({ order: s.order, step: s.step, expectedResult: s.expectedResult })),
      },
      attachments: {
        create: [...src.attachments]
          .sort((a, b) => a.order - b.order)
          .map((a) => ({ order: a.order, url: a.url, kind: a.kind, label: a.label })),
      },
    },
  });
}

export async function cloneFeatureInto(
  sourceId: string,
  targetProjectId: string,
  createdById: string,
  nameOverride?: string,
) {
  const src = await prisma.feature.findUnique({
    where: { id: sourceId },
    include: { testCases: { select: { id: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!src) throw new Error("Feature not found");
  const feature = await prisma.feature.create({
    data: {
      projectId: targetProjectId,
      name: nameOverride ?? `${src.name} (copy)`,
      description: src.description,
      minPassPercent: src.minPassPercent,
    },
  });
  for (const tc of src.testCases) await cloneTestCaseInto(tc.id, feature.id, createdById);
  return feature;
}

export async function cloneProjectDeep(sourceId: string, createdById: string, nameOverride?: string) {
  const src = await prisma.project.findUnique({
    where: { id: sourceId },
    include: { features: { select: { id: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!src) throw new Error("Project not found");
  const project = await prisma.project.create({
    data: {
      name: nameOverride ?? `${src.name} (copy)`,
      description: src.description,
      squad: src.squad,
      minPassPercent: src.minPassPercent,
      createdById,
    },
  });
  for (const f of src.features) await cloneFeatureInto(f.id, project.id, createdById);
  return project;
}
