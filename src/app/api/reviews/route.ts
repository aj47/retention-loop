import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { body, HttpError, route } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { directorMode } from "@/lib/director/model";
import { latestPanel, PERSONAS } from "@/lib/director/panel";
import { enqueue } from "@/lib/jobs/runner";

/** Latest panel reviews for a render or script version, plus the panel job's progress. */
export const GET = route(async (req) => {
  const target = new URL(req.url).searchParams.get("target") ?? "";
  const d = await db();
  const jobs = (await d.select().from(schema.jobs).where(eq(schema.jobs.type, "review_panel")).orderBy(desc(schema.jobs.createdAt)).limit(20)).filter(
    (j) => j.payload.targetId === target,
  );
  return { personas: PERSONAS.map(({ instruction: _i, ...p }) => (void _i, p)), reviews: await latestPanel(target), job: jobs[0] ?? null };
});

export const POST = route(async (req) => {
  const { targetType, targetId, projectId } = await body(req, z.object({ targetType: z.enum(["render", "script", "video"]), targetId: z.string(), projectId: z.string() }));
  if (directorMode() !== "gemini") throw new HttpError(400, "The review panel needs a Gemini API key");
  return { job: await enqueue("review_panel", { targetType, targetId }, projectId) };
});
