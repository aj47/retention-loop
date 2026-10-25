import { and, eq, ne, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { body, HttpError, notFound, route } from "@/lib/api";
import { analyzeRetention, parseRetentionCsv } from "@/lib/analytics/retention";
import { db, schema } from "@/lib/db";
import { analyzeForProject } from "@/lib/analytics/project";
import { getProjectBundle } from "@/lib/projects/service";

type Ctx = { params: Promise<{ id: string }> };

const Input = z.object({
  csv: z.string().min(1),
  label: z.string().min(1),
  durationSeconds: z.number().positive(),
  format: z.string().default("long-form"),
});

/** Re-runs analysis for a stored curve against the current comparable set. */
export const GET = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const curveId = new URL(req.url).searchParams.get("curve");
  const d = await db();
  const [curve] = await d.select().from(schema.retentionCurves).where(and(eq(schema.retentionCurves.id, curveId ?? ""), eq(schema.retentionCurves.projectId, id)));
  if (!curve) notFound("Curve not found");
  const comparables = await d
    .select()
    .from(schema.retentionCurves)
    .where(and(eq(schema.retentionCurves.format, curve.format), or(isNull(schema.retentionCurves.projectId), ne(schema.retentionCurves.projectId, id))));
  const others = comparables.filter((c) => !curve.youtubeVideoId || c.youtubeVideoId !== curve.youtubeVideoId);
  return { curve, analysis: analyzeRetention(curve.points, { durationSeconds: curve.durationSeconds, comparables: others.map((c) => c.points) }) };
});

/**
 * Imports a retention curve, compares it with the channel's other curves of
 * the same format, and stores observations and hypotheses as separate findings.
 */
export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const input = await body(req, Input);
  if (!(await getProjectBundle(id))) notFound("Project not found");
  let points;
  try {
    points = parseRetentionCsv(input.csv, input.durationSeconds);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : "Could not read CSV");
  }
  if (points.length < 10) throw new HttpError(400, "Need at least 10 retention points");
  return analyzeForProject({ projectId: id, label: input.label, format: input.format, durationSeconds: input.durationSeconds, points, source: "csv" });
});
