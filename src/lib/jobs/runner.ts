import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { JobType } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { prepareMedia, renderPlan, verifyRender } from "./handlers";
import { syncChannel, synthesizeMemory } from "@/lib/youtube/sync";
import { runPanel } from "@/lib/director/panel";
import { scoutIdeas } from "@/lib/director/ideas";

const MAX_ATTEMPTS = 2;

type Handler = (payload: Record<string, unknown>, stage: (s: string) => Promise<void>) => Promise<Record<string, unknown>>;
const handlers: Record<JobType, Handler> = {
  prepare_media: (p, stage) => prepareMedia(p.assetId as string, stage),
  render_preview: (p, stage) => renderPlan(p.renderId as string, Boolean(p.full), Number(p.verifyRound ?? 1), stage),
  verify_render: (p, stage) => verifyRender(p.renderId as string, Number(p.round ?? 1), stage),
  sync_channel: (p, stage) => syncChannel(Number(p.limit ?? 8), stage),
  synthesize_memory: (p, stage) => synthesizeMemory(stage, Boolean(p.rewatch)),
  scout_ideas: (_p, stage) => scoutIdeas(stage),
  review_panel: (p, stage) => runPanel(p.targetType as "render" | "script" | "video", p.targetId as string, stage),
};

/** Jobs in different lanes run concurrently; jobs within a lane run one at a time. */
const LANES: Record<string, JobType[]> = {
  media: ["prepare_media", "render_preview", "verify_render"],
  channel: ["sync_channel", "synthesize_memory", "scout_ideas"],
  review: ["review_panel"],
};

const state = globalThis as unknown as { __rlRunner?: { running: Set<string>; recovered: boolean } };
state.__rlRunner ??= { running: new Set(), recovered: false };

export async function enqueue(type: JobType, payload: Record<string, unknown>, projectId: string | null) {
  const d = await db();
  const [job] = await d.insert(schema.jobs).values({ id: newId("job"), type, payload, projectId }).returning();
  void kick();
  return job;
}

/**
 * Processes queued jobs in this server process, one lane at a time per lane.
 * Job state lives in the database, so work interrupted by a restart is
 * re-queued and resumed.
 */
export async function kick(): Promise<void> {
  const r = state.__rlRunner!;
  const d = await db();
  if (!r.recovered) {
    r.recovered = true;
    await d.update(schema.jobs).set({ status: "queued", stage: "Resuming" }).where(eq(schema.jobs.status, "running"));
  }
  await Promise.all(Object.entries(LANES).map(([lane, types]) => runLane(lane, types)));
}

async function runLane(lane: string, types: JobType[]) {
  const r = state.__rlRunner!;
  if (r.running.has(lane)) return;
  r.running.add(lane);
  try {
    const d = await db();
    for (;;) {
      const [job] = await d
        .select()
        .from(schema.jobs)
        .where(and(eq(schema.jobs.status, "queued"), inArray(schema.jobs.type, types)))
        .orderBy(asc(schema.jobs.createdAt))
        .limit(1);
      if (!job) break;
      const attempts = job.attempts + 1;
      await d.update(schema.jobs).set({ status: "running", attempts, updatedAt: new Date() }).where(eq(schema.jobs.id, job.id));
      const stage = async (s: string) => {
        await d.update(schema.jobs).set({ stage: s, updatedAt: new Date() }).where(eq(schema.jobs.id, job.id));
      };
      try {
        const result = await handlers[job.type](job.payload, stage);
        await d.update(schema.jobs).set({ status: "succeeded", stage: "Ready for review", result, error: null, updatedAt: new Date() }).where(eq(schema.jobs.id, job.id));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[jobs] ${job.type} ${job.id} failed:`, message);
        const retry = attempts < MAX_ATTEMPTS;
        await d
          .update(schema.jobs)
          .set({ status: retry ? "queued" : "failed", stage: retry ? "Retrying" : "Failed — retry available", error: message.slice(0, 2000), updatedAt: new Date() })
          .where(eq(schema.jobs.id, job.id));
      }
    }
  } finally {
    r.running.delete(lane);
  }
}

export async function retryJob(id: string) {
  const d = await db();
  await d.update(schema.jobs).set({ status: "queued", stage: "Queued", attempts: 0, error: null }).where(eq(schema.jobs.id, id));
  void kick();
}
