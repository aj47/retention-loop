import { desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { body, HttpError, route } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { enqueue } from "@/lib/jobs/runner";
import { connectedChannelId } from "@/lib/youtube/client";

/** Connection state, synced videos with their curves, and the latest sync/memory jobs. */
export const GET = route(async () => {
  const d = await db();
  const videos = await d.select().from(schema.youtubeVideos).orderBy(desc(schema.youtubeVideos.syncedAt));
  const curveIds = videos.flatMap((v) => (v.curveId ? [v.curveId] : []));
  const curves = curveIds.length ? await d.select().from(schema.retentionCurves).where(inArray(schema.retentionCurves.id, curveIds)) : [];
  const jobs = await d
    .select()
    .from(schema.jobs)
    .where(or(eq(schema.jobs.type, "sync_channel"), eq(schema.jobs.type, "synthesize_memory")))
    .orderBy(desc(schema.jobs.createdAt))
    .limit(4);
  const projects = await d.select({ id: schema.projects.id, youtubeVideoId: schema.projects.youtubeVideoId }).from(schema.projects);
  return {
    channelId: connectedChannelId(),
    videos: videos.map((v) => ({
      ...v,
      points: curves.find((c) => c.id === v.curveId)?.points ?? [],
      projectId: projects.find((p) => p.youtubeVideoId === v.id)?.id ?? null,
    })),
    jobs,
  };
});

export const POST = route(async (req) => {
  const { action, limit } = await body(req, z.object({ action: z.enum(["sync", "synthesize"]), limit: z.number().int().min(1).max(20).default(8) }));
  if (!connectedChannelId()) throw new HttpError(400, "YouTube Analytics is not connected");
  const job = action === "sync" ? await enqueue("sync_channel", { limit }, null) : await enqueue("synthesize_memory", {}, null);
  return { job };
});
