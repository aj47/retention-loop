import { desc, isNull } from "drizzle-orm";
import { z } from "zod";
import { body, HttpError, route } from "@/lib/api";
import { parseRetentionCsv } from "@/lib/analytics/retention";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/ids";

/** Channel-history curves (not tied to a project) used as comparable baselines. */
export const GET = route(async () => {
  const d = await db();
  const curves = await d.select().from(schema.retentionCurves).where(isNull(schema.retentionCurves.projectId)).orderBy(desc(schema.retentionCurves.createdAt));
  return { curves: curves.map(({ points, ...c }) => ({ ...c, pointCount: points.length })) };
});

export const POST = route(async (req) => {
  const input = await body(req, z.object({ label: z.string().min(1), csv: z.string().min(1), durationSeconds: z.number().positive(), format: z.string().default("long-form") }));
  let points;
  try {
    points = parseRetentionCsv(input.csv, input.durationSeconds);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : "Could not read CSV");
  }
  const d = await db();
  const [curve] = await d
    .insert(schema.retentionCurves)
    .values({ id: newId("crv"), projectId: null, label: input.label, format: input.format, durationSeconds: input.durationSeconds, points, source: "csv" })
    .returning();
  return { curve: { ...curve, points: undefined } };
});
