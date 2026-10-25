import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { ArtifactKind, ProjectStage, VersionOrigin } from "@/lib/db/schema";
import { newId } from "@/lib/ids";

export type Project = typeof schema.projects.$inferSelect;
export type Artifact = typeof schema.artifacts.$inferSelect;
export type ArtifactVersion = typeof schema.artifactVersions.$inferSelect;
export type SourceAsset = typeof schema.sourceAssets.$inferSelect;
export type EditPlan = typeof schema.editPlans.$inferSelect;
export type EditOperation = typeof schema.editOperations.$inferSelect;
export type Render = typeof schema.renders.$inferSelect;
export type Finding = typeof schema.findings.$inferSelect;
export type RetentionCurve = typeof schema.retentionCurves.$inferSelect;
export type Job = typeof schema.jobs.$inferSelect;
export type Verification = typeof schema.verifications.$inferSelect;

const STAGE_ORDER: ProjectStage[] = ["idea", "script", "rough_cut", "published"];

export async function logEvent(projectId: string, type: string, data: Record<string, unknown> = {}) {
  const d = await db();
  await d.insert(schema.events).values({ id: newId("evt"), projectId, type, data });
  await d.update(schema.projects).set({ updatedAt: new Date() }).where(eq(schema.projects.id, projectId));
}

export async function createProject(input: { title: string; intent?: string; stage?: ProjectStage }): Promise<Project> {
  const d = await db();
  const [p] = await d
    .insert(schema.projects)
    .values({ id: newId("prj"), title: input.title.slice(0, 140), intent: input.intent ?? "", stage: input.stage ?? "idea" })
    .returning();
  await logEvent(p.id, "project.created", { stage: p.stage });
  return p;
}

export async function updateProject(id: string, patch: Partial<Pick<Project, "title" | "intent" | "audience">>) {
  const d = await db();
  await d.update(schema.projects).set({ ...patch, updatedAt: new Date() }).where(eq(schema.projects.id, id));
}

/** Advances the stage but never moves it backwards. */
export async function advanceStage(id: string, stage: ProjectStage) {
  const d = await db();
  const [p] = await d.select().from(schema.projects).where(eq(schema.projects.id, id));
  if (p && STAGE_ORDER.indexOf(stage) > STAGE_ORDER.indexOf(p.stage)) {
    await d.update(schema.projects).set({ stage }).where(eq(schema.projects.id, id));
  }
}

export async function listProjects(): Promise<Project[]> {
  const d = await db();
  return d.select().from(schema.projects).orderBy(desc(schema.projects.updatedAt));
}

export async function deleteProject(id: string) {
  const d = await db();
  await d.delete(schema.projects).where(eq(schema.projects.id, id));
}

export async function getOrCreateArtifact(projectId: string, kind: ArtifactKind, title: string): Promise<Artifact> {
  const d = await db();
  const [existing] = await d
    .select()
    .from(schema.artifacts)
    .where(and(eq(schema.artifacts.projectId, projectId), eq(schema.artifacts.kind, kind)));
  if (existing) return existing;
  const [a] = await d.insert(schema.artifacts).values({ id: newId("art"), projectId, kind, title }).returning();
  return a;
}

/** Versions are immutable; adding one optionally makes it current. */
export async function addVersion(
  artifact: Artifact,
  input: { origin: VersionOrigin; label: string; content: string; data?: Record<string, unknown>; model?: string | null; makeCurrent?: boolean },
): Promise<ArtifactVersion> {
  const d = await db();
  const [v] = await d
    .insert(schema.artifactVersions)
    .values({
      id: newId("ver"),
      artifactId: artifact.id,
      parentVersionId: artifact.currentVersionId,
      origin: input.origin,
      label: input.label,
      content: input.content,
      data: input.data ?? {},
      model: input.model ?? null,
    })
    .returning();
  if (input.makeCurrent ?? true) {
    await d.update(schema.artifacts).set({ currentVersionId: v.id }).where(eq(schema.artifacts.id, artifact.id));
    artifact.currentVersionId = v.id;
  }
  await logEvent(artifact.projectId, `${artifact.kind}.version_added`, { versionId: v.id, origin: v.origin, label: v.label, current: input.makeCurrent ?? true });
  return v;
}

export async function setCurrentVersion(artifactId: string, versionId: string) {
  const d = await db();
  const [a] = await d.update(schema.artifacts).set({ currentVersionId: versionId }).where(eq(schema.artifacts.id, artifactId)).returning();
  if (a) await logEvent(a.projectId, `${a.kind}.restored`, { versionId });
}

export async function getVersion(id: string): Promise<ArtifactVersion | undefined> {
  const d = await db();
  const [v] = await d.select().from(schema.artifactVersions).where(eq(schema.artifactVersions.id, id));
  return v;
}

export interface ArtifactWithVersions extends Artifact {
  versions: ArtifactVersion[];
  current: ArtifactVersion | null;
}

export interface ProjectBundle {
  project: Project;
  artifacts: Partial<Record<ArtifactKind, ArtifactWithVersions>>;
  assets: SourceAsset[];
  plans: (EditPlan & { operations: EditOperation[]; renders: Render[]; verifications: Verification[] })[];
  curves: RetentionCurve[];
  findings: Finding[];
  jobs: Job[];
  events: (typeof schema.events.$inferSelect)[];
}

export async function getProjectBundle(id: string): Promise<ProjectBundle | null> {
  const d = await db();
  const [project] = await d.select().from(schema.projects).where(eq(schema.projects.id, id));
  if (!project) return null;

  const arts = await d.select().from(schema.artifacts).where(eq(schema.artifacts.projectId, id));
  const versions = arts.length
    ? await d
        .select()
        .from(schema.artifactVersions)
        .where(inArray(schema.artifactVersions.artifactId, arts.map((a) => a.id)))
        .orderBy(asc(schema.artifactVersions.createdAt))
    : [];
  const artifacts: ProjectBundle["artifacts"] = {};
  for (const a of arts) {
    const vs = versions.filter((v) => v.artifactId === a.id);
    artifacts[a.kind] = { ...a, versions: vs, current: vs.find((v) => v.id === a.currentVersionId) ?? null };
  }

  const plans = await d.select().from(schema.editPlans).where(eq(schema.editPlans.projectId, id)).orderBy(desc(schema.editPlans.createdAt));
  const planIds = plans.map((p) => p.id);
  const ops = planIds.length
    ? await d.select().from(schema.editOperations).where(inArray(schema.editOperations.planId, planIds)).orderBy(asc(schema.editOperations.ordinal))
    : [];
  const rends = planIds.length
    ? await d.select().from(schema.renders).where(inArray(schema.renders.planId, planIds)).orderBy(desc(schema.renders.createdAt))
    : [];

  const verifs = planIds.length
    ? await d.select().from(schema.verifications).where(inArray(schema.verifications.planId, planIds)).orderBy(asc(schema.verifications.createdAt))
    : [];

  return {
    project,
    artifacts,
    assets: await d.select().from(schema.sourceAssets).where(eq(schema.sourceAssets.projectId, id)).orderBy(desc(schema.sourceAssets.createdAt)),
    plans: plans.map((p) => ({
      ...p,
      operations: ops.filter((o) => o.planId === p.id),
      renders: rends.filter((r) => r.planId === p.id),
      verifications: verifs.filter((v) => v.planId === p.id),
    })),
    curves: await d.select().from(schema.retentionCurves).where(eq(schema.retentionCurves.projectId, id)).orderBy(desc(schema.retentionCurves.createdAt)),
    findings: await d.select().from(schema.findings).where(eq(schema.findings.projectId, id)).orderBy(asc(schema.findings.createdAt)),
    jobs: await d.select().from(schema.jobs).where(eq(schema.jobs.projectId, id)).orderBy(desc(schema.jobs.createdAt)),
    events: await d.select().from(schema.events).where(eq(schema.events.projectId, id)).orderBy(desc(schema.events.createdAt)).limit(50),
  };
}

export async function recordFeedback(input: {
  projectId: string | null;
  targetType: string;
  targetId: string;
  decision: "accepted" | "rejected" | "modified" | "preserved";
  note?: string;
}) {
  const d = await db();
  await d.insert(schema.feedback).values({ id: newId("fbk"), ...input, note: input.note ?? "" });
}
