import { and, desc, eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { formatClock } from "@/lib/edit/export";
import { sourceToOutput } from "@/lib/edit/timeline";
import { newId } from "@/lib/ids";
import { renderPath } from "@/lib/jobs/handlers";
import { formatChannelForPrompt, formatLessonsForPrompt, getChannel, listLessons } from "@/lib/memory/lessons";
import { fileFrame, youtubeFrame } from "@/lib/youtube/frames";
import { analyzeRetention } from "@/lib/analytics/retention";
import { ARGON, gemini, structured } from "./model";

/** Antigravity managed agent; each reviewer is a saved agent pinned to Gemini 4 Argon. */
const BASE_AGENT = "antigravity-preview-09-2026";

export interface Persona {
  id: string;
  name: string;
  role: string;
  /** What this reviewer cares about; becomes the agent's system instruction. */
  instruction: string;
}

export const PERSONAS: Persona[] = [
  {
    id: "first-time-viewer",
    name: "Maya",
    role: "First-time viewer from the home feed",
    instruction:
      "You are Maya, a developer who has never heard of this channel and clicked from the YouTube home feed. You are impatient and honest. You judge whether the first 30 seconds tell you what you'll get, when you would click away, and what confused you. You do not care about production polish, only whether you'd keep watching.",
  },
  {
    id: "retention-editor",
    name: "Dev",
    role: "Professional YouTube retention editor",
    instruction:
      "You are Dev, a professional YouTube editor who has cut hundreds of tech videos for retention. You look at pacing, dead air, the order of setup versus payoff, transitions, and anything on screen that breaks flow (notifications, loading screens, desktop clutter). You give concrete, timestamped edit notes.",
  },
  {
    id: "technical-skeptic",
    name: "Priya",
    role: "Senior engineer and skeptical commenter",
    instruction:
      "You are Priya, a senior engineer who comments when tech videos overclaim. You check that claims are accurate and shown rather than asserted, that the demo really demonstrates what the title promises, and that nothing important was cut. Use Google Search to verify any factual claim you doubt and cite what you found.",
  },
  {
    id: "longtime-subscriber",
    name: "Sam",
    role: "Longtime subscriber who knows the channel",
    instruction:
      "You are Sam, a longtime subscriber of this channel. You know its voice and what has and hasn't worked before (the channel lessons are provided). You judge whether this still feels like the creator, whether it applies the channel's own lessons, and whether it repeats past mistakes.",
  },
];

const ReviewSchema = z.object({
  verdict: z.enum(["ship", "revise"]),
  score: z.number().min(1).max(10),
  headline: z.string(),
  wouldStopAtSeconds: z.number().nullable().optional(),
  notes: z
    .array(z.object({ atSeconds: z.number().nullable().optional(), note: z.string(), severity: z.enum(["high", "medium", "low"]).default("medium") }))
    .default([]),
  topFix: z.string(),
});
export type Review = z.infer<typeof ReviewSchema>;

const ConsensusSchema = z.object({
  summary: z.string().describe("Two sentences: where the reviewers agree and disagree"),
  fixes: z.array(z.object({ fix: z.string(), raisedBy: z.array(z.string()), atSeconds: z.number().nullable() })).describe("Up to 4 fixes, most agreed-on first"),
});

const agentId = (p: Persona) => `retention-loop-${p.id}`;

/** Creates the persona agents once; they persist in the Gemini API project. */
async function ensureAgents() {
  const ai = gemini();
  await Promise.all(
    PERSONAS.map(async (p) => {
      try {
        await ai.agents.get(agentId(p));
      } catch {
        await ai.agents.create({
          id: agentId(p),
          base_agent: BASE_AGENT,
          agent_config: { type: "antigravity", model: ARGON },
          system_instruction: p.instruction,
          base_environment: { type: "remote" },
        } as never);
      }
    }),
  );
}

function parseReview(text: string): Review {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("Reviewer returned no JSON");
  return ReviewSchema.parse(JSON.parse(json));
}

const REVIEW_FORMAT = `Reply with ONLY a JSON object, no prose around it:
{"verdict": "ship" | "revise", "score": 1-10, "headline": "one-line take in your own voice", "wouldStopAtSeconds": number or null, "notes": [{"atSeconds": number or null, "note": "specific note", "severity": "high" | "medium" | "low"}], "topFix": "the single change you'd make"}
Give 2 to 5 notes.`;

type Part = { type: "text"; text: string } | { type: "image"; data: string; mime_type: string };

async function runReviewer(persona: Persona, input: Part[]): Promise<{ review: Review; interactionId: string }> {
  const ai = gemini();
  let interaction = (await ai.interactions.create({ agent: agentId(persona), input: input as never, environment: "remote", background: true } as never, { timeout: 15 * 60 * 1000 })) as {
    id: string;
    status: string;
    output_text?: string;
  };
  while (!["completed", "failed", "cancelled", "incomplete"].includes(interaction.status)) {
    await new Promise((r) => setTimeout(r, 4000));
    interaction = (await ai.interactions.get(interaction.id)) as typeof interaction;
  }
  if (interaction.status !== "completed" || !interaction.output_text) throw new Error(`Reviewer ${persona.name} ended with status ${interaction.status}`);
  return { review: parseReview(interaction.output_text), interactionId: interaction.id };
}

/** Keyframes of a rendered cut (every join plus regular samples) and its transcript in output time. */
async function renderMaterial(renderId: string): Promise<{ parts: Part[]; context: string; projectId: string }> {
  const d = await db();
  const [render] = await d.select().from(schema.renders).where(eq(schema.renders.id, renderId));
  const [plan] = await d.select().from(schema.editPlans).where(eq(schema.editPlans.id, render.planId));
  const [asset] = await d.select().from(schema.sourceAssets).where(eq(schema.sourceAssets.id, plan.sourceAssetId));
  const joins = render.timeline.map((s) => s.outputIn + 0.4);
  const samples = Array.from({ length: 6 }, (_, i) => (render.duration * (i + 0.5)) / 6);
  const times = [...new Set([...joins.slice(0, 10), ...samples].map((t) => Math.round(Math.min(t, render.duration - 0.2) * 10) / 10))].sort((a, b) => a - b).slice(0, 14);
  const parts: Part[] = [];
  for (const t of times) {
    const file = await fileFrame(`${asset.id}-${renderId}`, renderPath(asset.id, renderId, false), t, 480);
    parts.push({ type: "text", text: `Frame at ${formatClock(t)}:` }, { type: "image", data: (await readFile(file)).toString("base64"), mime_type: "image/jpeg" });
  }
  const lines = (asset.transcript?.segments ?? [])
    .map((s) => ({ t: sourceToOutput(render.timeline, (s.start + s.end) / 2), text: s.text }))
    .filter((x): x is { t: number; text: string } => x.t != null)
    .sort((a, b) => a.t - b.t)
    .map((x) => `[${formatClock(x.t)}] ${x.text}`);
  const context = `You are reviewing a recut of a YouTube video (${formatClock(render.duration)} long), titled "${plan.treatment}". Below are keyframes from the cut (each labelled with its time) and its transcript in cut time.\n\n<transcript>\n${lines.join("\n")}\n</transcript>`;
  return { parts, context, projectId: plan.projectId };
}

/** A published video: storyboard frames at each retention moment and across the video, plus its retention curve. */
async function videoMaterial(videoId: string): Promise<{ parts: Part[]; context: string; projectId: string }> {
  const d = await db();
  const [video] = await d.select().from(schema.youtubeVideos).where(eq(schema.youtubeVideos.id, videoId));
  const [project] = await d.select().from(schema.projects).where(eq(schema.projects.youtubeVideoId, videoId));
  if (!video?.curveId || !project) throw new Error("Analyze this video first");
  const [curve] = await d.select().from(schema.retentionCurves).where(eq(schema.retentionCurves.id, video.curveId));
  const analysis = analyzeRetention(curve.points, { durationSeconds: video.durationSeconds });
  const moments = analysis.anomalies.slice(0, 5).flatMap((a) => [a.contextStartSeconds, a.startSeconds]);
  const samples = Array.from({ length: 6 }, (_, i) => (video.durationSeconds * (i + 0.5)) / 6);
  const times = [...new Set([0, 10, 20, ...moments, ...samples].map((t) => Math.round(Math.min(t, video.durationSeconds - 1))))].sort((a, b) => a - b).slice(0, 16);
  const parts: Part[] = [];
  for (const t of times) {
    const file = await youtubeFrame(videoId, t);
    parts.push({ type: "text", text: `Frame at ${formatClock(t)}:` }, { type: "image", data: (await readFile(file)).toString("base64"), mime_type: "image/jpeg" });
  }
  const pct = (r: number) => Math.round((curve.points.find((p) => p.ratio >= r)?.watchRatio ?? 0) * 100);
  const [asset] = await d.select().from(schema.sourceAssets).where(eq(schema.sourceAssets.projectId, project.id));
  const transcript = asset?.transcript ? `\n<transcript>\n${asset.transcript.segments.map((s) => `[${formatClock(s.start)}] ${s.text}`).join("\n")}\n</transcript>` : "";
  const context = `You are reviewing a PUBLISHED YouTube video, "${video.title}" (${formatClock(video.durationSeconds)}), using its real audience retention. Watch ratio: ${[0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.95].map((r) => `${pct(r)}% at ${formatClock(r * video.durationSeconds)}`).join(", ")}. Average viewed: ${video.metrics.averageViewPercentage ?? "?"}%. Moments where viewers left faster or held better than usual: ${analysis.anomalies
    .slice(0, 5)
    .map((a) => `${formatClock(a.startSeconds)} (${a.direction === "steeper_decline" ? "left faster" : "held better"})`)
    .join(", ")}. Below are frames from the video, each labelled with its time. Say where you would have stopped watching and why, and what the creator should do differently next time.${transcript}`;
  return { parts, context, projectId: project.id };
}

async function scriptMaterial(versionId: string): Promise<{ parts: Part[]; context: string; projectId: string }> {
  const d = await db();
  const [v] = await d.select().from(schema.artifactVersions).where(eq(schema.artifactVersions.id, versionId));
  const [a] = await d.select().from(schema.artifacts).where(eq(schema.artifacts.id, v.artifactId));
  return { parts: [], context: `You are reviewing a script for an upcoming YouTube video before it is filmed. Times are not available; use null for atSeconds.\n\n<script>\n${v.content}\n</script>`, projectId: a.projectId };
}

/**
 * Convenes four reviewer agents with different perspectives in parallel, then
 * has Gemini 4 Argon merge their reviews into an agreed list of fixes.
 */
export async function runPanel(targetType: "render" | "script" | "video", targetId: string, stage: (s: string) => Promise<void>) {
  const d = await db();
  const material = targetType === "render" ? await renderMaterial(targetId) : targetType === "video" ? await videoMaterial(targetId) : await scriptMaterial(targetId);
  const [channel, lessons] = await Promise.all([getChannel(), listLessons()]);
  const channelContext = `<channel>\n${formatChannelForPrompt(channel)}\n</channel>\n<channel_lessons>\n${formatLessonsForPrompt(lessons.slice(0, 8))}\n</channel_lessons>`;

  await stage("Starting 4 reviewer agents");
  await ensureAgents();
  const rows = PERSONAS.map((p) => ({ id: newId("rev"), projectId: material.projectId, targetType, targetId, persona: p.id, status: "running" as const }));
  await d.insert(schema.reviews).values(rows);

  let finished = 0;
  await stage(`4 Managed Agents are reviewing (0/4 done)`);
  const results = await Promise.all(
    PERSONAS.map(async (p, i) => {
      try {
        const extra = p.id === "longtime-subscriber" ? `\n\n${channelContext}` : "";
        const { review, interactionId } = await runReviewer(p, [{ type: "text", text: `${material.context}${extra}\n\n${REVIEW_FORMAT}` }, ...material.parts]);
        await d.update(schema.reviews).set({ status: "done", result: review, interactionId }).where(eq(schema.reviews.id, rows[i].id));
        return { persona: p, review };
      } catch (err) {
        await d.update(schema.reviews).set({ status: "failed", error: (err as Error).message.slice(0, 500) }).where(eq(schema.reviews.id, rows[i].id));
        return null;
      } finally {
        await stage(`4 Managed Agents are reviewing (${++finished}/4 done)`);
      }
    }),
  );

  const done = results.filter((r): r is { persona: Persona; review: Review } => r != null);
  if (!done.length) throw new Error("Every reviewer failed");
  await stage("Gemini 4 Argon is merging the reviews");
  const merged = await structured({
    schema: ConsensusSchema,
    system: "You are the AI Director. Merge a review panel's feedback into the fixes most worth making. Prefer fixes several reviewers agree on.",
    input: done.map((r) => `<review by="${r.persona.name}, ${r.persona.role}">\n${JSON.stringify(r.review)}\n</review>`).join("\n"),
    thinking: "low",
  });
  await d.insert(schema.reviews).values({ id: newId("rev"), projectId: material.projectId, targetType, targetId, persona: "consensus", status: "done", result: merged.data });
  return { reviewers: done.length };
}

export async function latestPanel(targetId: string) {
  const d = await db();
  const rows = await d.select().from(schema.reviews).where(and(eq(schema.reviews.targetId, targetId))).orderBy(desc(schema.reviews.createdAt));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.persona)) latest.set(r.persona, r);
  return [...latest.values()];
}
