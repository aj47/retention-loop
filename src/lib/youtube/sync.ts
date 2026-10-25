import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { analyzeRetention } from "@/lib/analytics/retention";
import { db, schema } from "@/lib/db";
import { videoPart } from "@/lib/director";
import { ARGON, FLASH, structured } from "@/lib/director/model";
import { formatClock } from "@/lib/edit/export";
import { newId } from "@/lib/ids";
import { formatChannelForPrompt, getChannel } from "@/lib/memory/lessons";
import { enqueue } from "@/lib/jobs/runner";
import { connectedChannelId, fetchRetention, listUploads, youtubeUrl } from "./client";

/** Shortest upload treated as long-form; Shorts and teasers have different retention dynamics. */
const LONG_FORM_SECONDS = 150;

/** Pulls recent long-form uploads and their retention curves, then queues memory synthesis. */
export async function syncChannel(limit: number, stage: (s: string) => Promise<void>) {
  const channelId = connectedChannelId();
  if (!channelId) throw new Error("YouTube Analytics is not connected");
  await stage("Listing uploads");
  const uploads = (await listUploads(channelId, 40)).filter((v) => v.durationSeconds >= LONG_FORM_SECONDS).slice(0, limit);
  const d = await db();
  let synced = 0;
  for (const [i, v] of uploads.entries()) {
    await stage(`Pulling retention ${i + 1}/${uploads.length}`);
    const { points, metrics } = await fetchRetention(channelId, v.id);
    if (points.length < 10) continue;
    const [existing] = await d.select().from(schema.youtubeVideos).where(eq(schema.youtubeVideos.id, v.id));
    if (existing?.curveId) await d.delete(schema.retentionCurves).where(eq(schema.retentionCurves.id, existing.curveId));
    const curveId = newId("crv");
    await d.insert(schema.retentionCurves).values({
      id: curveId,
      projectId: null,
      label: v.title,
      format: "long-form",
      durationSeconds: v.durationSeconds,
      points,
      source: "youtube",
      youtubeVideoId: v.id,
    });
    const row = { title: v.title, durationSeconds: v.durationSeconds, metrics, curveId, syncedAt: new Date() };
    if (existing) await d.update(schema.youtubeVideos).set(row).where(eq(schema.youtubeVideos.id, v.id));
    else await d.insert(schema.youtubeVideos).values({ id: v.id, ...row });
    synced++;
  }
  await enqueue("synthesize_memory", {}, null);
  return { synced };
}

const VideoCardSchema = z.object({
  topic: z.string(),
  hook: z.string().describe("What the first 15 seconds show and promise"),
  firstPayoffSeconds: z.number().nullable().describe("When the first concrete result or demo is visible, in seconds; null if never"),
  beats: z.array(z.object({ atSeconds: z.number(), label: z.string() })).describe("Narrative beats in order"),
  moments: z
    .array(
      z.object({
        atSeconds: z.number(),
        retention: z.enum(["drop", "hold"]),
        onScreen: z.string().describe("What is on screen and being said just before and at this moment"),
      }),
    )
    .describe("One entry per flagged retention moment, describing the footage"),
});
export type VideoCard = z.infer<typeof VideoCardSchema>;

const MemorySchema = z.object({
  channelSummary: z.string().describe("Two sentences on what this channel's audience responds to, grounded in the evidence"),
  lessons: z.array(
    z.object({
      claim: z.string().describe("A specific, testable editorial lesson"),
      applicability: z.string().describe("When it applies (format, topic, part of the video)"),
      suggestedUse: z.string().describe("How to use it in the next script or edit"),
      status: z.enum(["observation", "hypothesis"]),
      strength: z.enum(["weak", "moderate", "strong"]),
      evidence: z.array(z.object({ videoId: z.string(), atSeconds: z.number().nullable(), note: z.string() })),
      counterexamples: z.array(z.object({ videoId: z.string(), atSeconds: z.number().nullable(), note: z.string() })),
    }),
  ),
});

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/**
 * Builds channel memory in two tiers: Gemini Flash watches each video in
 * parallel and writes a card tied to its retention moments, then Gemini 4
 * Argon reads every card and curve together in one long-context call and
 * writes lessons with evidence and counterexamples.
 */
export async function synthesizeMemory(stage: (s: string) => Promise<void>) {
  const d = await db();
  const videos = (await d.select().from(schema.youtubeVideos).orderBy(desc(schema.youtubeVideos.syncedAt))).filter((v) => v.curveId);
  if (!videos.length) throw new Error("No synced videos with retention data");
  const curves = await d.select().from(schema.retentionCurves).where(inArray(schema.retentionCurves.id, videos.map((v) => v.curveId!)));
  const curveFor = (id: string) => curves.find((c) => c.id === id)!;

  const analyses = videos.map((v) => {
    const curve = curveFor(v.curveId!);
    const others = curves.filter((c) => c.id !== curve.id).map((c) => c.points);
    return analyzeRetention(curve.points, { durationSeconds: v.durationSeconds, comparables: others });
  });

  let done = 0;
  await stage(`Gemini Flash is watching ${videos.length} videos`);
  const cards = await mapLimit(videos, 4, async (v) => {
    const i = videos.indexOf(v);
    if (v.card) return v.card as VideoCard;
    const anomalies = analyses[i].anomalies.slice(0, 4);
    const r = await structured({
      schema: VideoCardSchema,
      model: FLASH,
      thinking: "low",
      background: true,
      system: "You annotate a creator's published YouTube video for an editorial memory. Describe only what you see and hear.",
      input: [
        videoPart(youtubeUrl(v.id)),
        {
          type: "text",
          text: `Title: ${v.title}\nRetention moments to describe (seconds, direction vs. this channel's other videos):\n${anomalies
            .map((a) => `- ${formatClock(a.startSeconds)}–${formatClock(a.endSeconds)} ${a.direction === "steeper_decline" ? "drop" : "hold"}`)
            .join("\n") || "- none flagged"}\nDescribe the hook, when the first payoff is visible, the narrative beats, and what is on screen at each moment.`,
        },
      ],
    });
    await d.update(schema.youtubeVideos).set({ card: r.data }).where(eq(schema.youtubeVideos.id, v.id));
    await stage(`Gemini Flash watched ${++done}/${videos.length} videos`);
    return r.data;
  });

  await stage("Gemini 4 Argon is synthesizing channel memory");
  const channel = await getChannel();
  const evidence = videos
    .map((v, i) => {
      const a = analyses[i];
      return `<video id="${v.id}" title="${v.title.replace(/"/g, "'")}" duration="${formatClock(v.durationSeconds)}" views="${v.metrics.views ?? "?"}" avg_view_pct="${v.metrics.averageViewPercentage ?? "?"}" retention_at_30s="${a.openingRetention ?? "n/a"}">
<retention_moments>${a.anomalies
        .slice(0, 4)
        .map((x) => `${formatClock(x.startSeconds)} ${x.direction} (${(x.residual * 100).toFixed(1)} pts vs channel)`)
        .join("; ") || "none"}</retention_moments>
<card>${JSON.stringify(cards[i])}</card>
</video>`;
    })
    .join("\n");
  const r = await structured({
    schema: MemorySchema,
    model: ARGON,
    thinking: "high",
    background: true,
    system:
      "You are the AI Director's memory for a YouTube creator. Write lessons only from the evidence given. Retention data shows where viewers left, never why, so lessons are observations or hypotheses, not proven causes. Include counterexamples whenever the evidence contradicts a lesson.",
    input: `<channel>\n${formatChannelForPrompt(channel)}\n</channel>\n\n<back_catalog count="${videos.length}">\n${evidence}\n</back_catalog>\n\nWrite 4 to 7 lessons about openings, payoff timing, pacing, and formats that this creator can apply to the next video. Each lesson cites specific videos and timestamps as evidence and lists any counterexamples.`,
  });

  const titleOf = (id: string) => videos.find((v) => v.id === id)?.title ?? id;
  await d.update(schema.lessons).set({ archived: true, updatedAt: new Date() }).where(eq(schema.lessons.origin, "gemini"));
  for (const l of r.data.lessons) {
    await d.insert(schema.lessons).values({
      id: newId("les"),
      claim: l.claim,
      applicability: l.applicability,
      suggestedUse: l.suggestedUse,
      status: l.status,
      strength: l.strength,
      scope: { formats: ["long-form"] },
      evidence: l.evidence.map((e) => ({ label: `${titleOf(e.videoId)}${e.atSeconds != null ? ` @ ${formatClock(e.atSeconds)}` : ""}: ${e.note}`, videoLabel: titleOf(e.videoId), startSeconds: e.atSeconds ?? undefined })),
      counterexamples: l.counterexamples.map((e) => ({ label: `${titleOf(e.videoId)}${e.atSeconds != null ? ` @ ${formatClock(e.atSeconds)}` : ""}: ${e.note}`, videoLabel: titleOf(e.videoId), startSeconds: e.atSeconds ?? undefined })),
      origin: "gemini",
    });
  }
  return { lessons: r.data.lessons.length, channelSummary: r.data.channelSummary, model: r.model, videos: videos.length };
}
