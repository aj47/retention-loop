import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { EditProposal } from "@/lib/director/schemas";
import { newId } from "@/lib/ids";
import { enqueue } from "@/lib/jobs/runner";
import { logEvent, recordFeedback, type EditOperation, type SourceAsset } from "@/lib/projects/service";
import { cutWarnings, snapToBoundary, timelineWarnings } from "./continuity";
import { classifyExecutability, compileTimeline, timelineKey, validateOperation } from "./timeline";

export async function createPlanFromProposal(input: {
  projectId: string;
  asset: SourceAsset;
  proposal: EditProposal;
  model: string;
  interactionId?: string;
  trace?: { videoLoads: number; thoughts: string[] };
}) {
  const { asset, proposal } = input;
  const duration = asset.probe!.duration;
  const silences = asset.silences ?? [];
  const d = await db();
  const planId = newId("pln");
  await d.insert(schema.editPlans).values({
    id: planId,
    projectId: input.projectId,
    sourceAssetId: asset.id,
    treatment: proposal.treatment,
    summary: [proposal.summary, ...proposal.continuity.map((c) => `• ${c}`)].join("\n"),
    model: input.model,
    observations: proposal.observations.filter((o) => o.atSeconds >= 0 && o.atSeconds <= duration),
    interactionId: input.interactionId ?? null,
    trace: input.trace ?? null,
  });

  const rows = proposal.operations.map((op, i) => {
    let executability = classifyExecutability(op.type);
    const clamp = (t: number | null) => (t == null ? null : Math.min(Math.max(0, t), duration));
    let sourceIn = clamp(op.sourceIn);
    let sourceOut = clamp(op.sourceOut);
    const warnings: string[] = [];
    if (executability === "direct" && op.type !== "tighten_pauses") {
      // Snap model-proposed cuts onto sentence boundaries or pauses.
      if (sourceIn != null) sourceIn = snapToBoundary(sourceIn, asset.transcript, silences);
      if (sourceOut != null) sourceOut = snapToBoundary(sourceOut, asset.transcript, silences);
      const cuts = [sourceIn, sourceOut].filter((t): t is number => t != null);
      warnings.push(...cutWarnings(cuts, asset.transcript, silences, duration).values());
    }
    if (op.requiredAssets.length && executability === "direct") executability = "partial";
    const candidate = { id: "", type: op.type, executability, enabled: true, sourceIn, sourceOut, targetAt: clamp(op.targetAt) };
    const invalid = executability === "direct" ? validateOperation(candidate, duration) : null;
    if (invalid) {
      warnings.push(invalid);
      executability = "suggested";
    }
    return {
      id: newId("op"),
      planId,
      ordinal: i,
      type: op.type,
      executability,
      title: op.title,
      rationale: op.rationale,
      sourceIn,
      sourceOut,
      targetAt: candidate.targetAt,
      requiredAssets: op.requiredAssets,
      warnings,
      lessonIds: op.lessonIds,
      // Advisory operations stay visible but are never silently "applied".
      enabled: executability === "direct",
    };
  });
  if (rows.length) await d.insert(schema.editOperations).values(rows);
  await logEvent(input.projectId, "edit_plan.proposed", { planId, operations: rows.length });
  return planId;
}

export async function getPlan(planId: string) {
  const d = await db();
  const [plan] = await d.select().from(schema.editPlans).where(eq(schema.editPlans.id, planId));
  if (!plan) return null;
  const operations = await d.select().from(schema.editOperations).where(eq(schema.editOperations.planId, planId)).orderBy(asc(schema.editOperations.ordinal));
  const [asset] = await d.select().from(schema.sourceAssets).where(eq(schema.sourceAssets.id, plan.sourceAssetId));
  return { plan, operations, asset };
}

export function compilePlan(operations: EditOperation[], asset: SourceAsset) {
  const duration = asset.probe!.duration;
  const silences = asset.silences ?? [];
  const compiled = compileTimeline(operations, duration, silences);
  return { ...compiled, warnings: timelineWarnings(compiled.segments, asset.transcript, silences, duration) };
}

export async function updateOperation(
  opId: string,
  patch: Partial<Pick<EditOperation, "enabled" | "sourceIn" | "sourceOut" | "targetAt" | "reviewStatus">>,
) {
  const d = await db();
  const [op] = await d.update(schema.editOperations).set(patch).where(eq(schema.editOperations.id, opId)).returning();
  if (!op) return null;
  const [plan] = await d.select().from(schema.editPlans).where(eq(schema.editPlans.id, op.planId));
  if (patch.reviewStatus === "accepted" || patch.reviewStatus === "rejected") {
    await recordFeedback({ projectId: plan.projectId, targetType: "edit_operation", targetId: op.id, decision: patch.reviewStatus, note: op.title });
  } else if (patch.sourceIn !== undefined || patch.sourceOut !== undefined || patch.targetAt !== undefined) {
    await recordFeedback({ projectId: plan.projectId, targetType: "edit_operation", targetId: op.id, decision: "modified", note: op.title });
  }
  return op;
}

/** Freezes the current enabled operations into a render and queues it. */
export async function requestRender(planId: string, full = false, verifyRound = 1) {
  const found = await getPlan(planId);
  if (!found) throw new Error("Plan not found");
  const { plan, operations, asset } = found;
  if (!asset.probe) throw new Error("Source media is still being prepared");
  const compiled = compilePlan(operations, asset);
  const d = await db();
  const key = timelineKey(compiled.segments);
  const existing = (await d.select().from(schema.renders).where(eq(schema.renders.planId, planId))).find((r) => timelineKey(r.timeline) === key);
  const renderId = existing?.id ?? newId("rnd");
  if (!existing) {
    await d.insert(schema.renders).values({
      id: renderId,
      planId,
      operationIds: compiled.appliedOperationIds,
      timeline: compiled.segments,
      duration: compiled.duration,
    });
  }
  if (full || !existing?.path) await enqueue("render_preview", { renderId, full, verifyRound }, plan.projectId);
  return { renderId, reused: Boolean(existing?.path) && !full };
}
