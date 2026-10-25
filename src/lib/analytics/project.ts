import { and, eq, isNull, ne, or } from "drizzle-orm";
import { directorContext } from "@/lib/api";
import { db, schema } from "@/lib/db";
import type { RetentionPoint } from "@/lib/db/schema";
import { readViewers } from "@/lib/director";
import type { InputPart } from "@/lib/director/model";
import { newId } from "@/lib/ids";
import { advanceStage, getProjectBundle, logEvent } from "@/lib/projects/service";
import { analyzeRetention } from "./retention";

/**
 * Stores a retention curve on a project, compares it with the channel's other
 * curves of the same format, has the Director read it (watching the video when
 * one is given), and records observations and hypotheses as separate findings.
 */
export async function analyzeForProject(input: {
  projectId: string;
  label: string;
  format: string;
  durationSeconds: number;
  points: RetentionPoint[];
  source: "csv" | "youtube";
  youtubeVideoId?: string;
  video?: InputPart;
}) {
  const { projectId: id } = input;
  const bundle = await getProjectBundle(id);
  if (!bundle) throw new Error("Project not found");
  const d = await db();
  const comparables = (
    await d
      .select()
      .from(schema.retentionCurves)
      .where(and(eq(schema.retentionCurves.format, input.format), or(isNull(schema.retentionCurves.projectId), ne(schema.retentionCurves.projectId, id))))
  ).filter((c) => !input.youtubeVideoId || c.youtubeVideoId !== input.youtubeVideoId);
  const analysis = analyzeRetention(input.points, { durationSeconds: input.durationSeconds, comparables: comparables.map((c) => c.points) });

  const curveId = newId("crv");
  await d.insert(schema.retentionCurves).values({
    id: curveId,
    projectId: id,
    label: input.label,
    format: input.format,
    durationSeconds: input.durationSeconds,
    points: input.points,
    source: input.source,
    youtubeVideoId: input.youtubeVideoId ?? null,
  });

  const transcript = bundle.assets.find((a) => a.transcript)?.transcript ?? null;
  const ctx = await directorContext(`${bundle.project.title} retention opening setup demo`, input.format);
  const read = await readViewers({ analysis, durationSeconds: input.durationSeconds, transcript, video: input.video }, ctx);

  const rows: (typeof schema.findings.$inferInsert)[] = [];
  for (const f of read.data.findings) {
    const a = analysis.anomalies[f.anomalyIndex];
    if (!a) continue;
    const base = { projectId: id, curveId, startSeconds: a.startSeconds, endSeconds: a.endSeconds };
    const evidence = {
      anomaly: a,
      baselineSource: analysis.baselineSource,
      comparableCount: comparables.length,
      resolutionSeconds: analysis.resolutionSeconds,
      watchedVideo: Boolean(input.video),
      videoLoads: read.trace?.videoLoads ?? 0,
    };
    rows.push({ ...base, id: newId("fnd"), label: "observed", title: f.observed, body: "", evidence });
    rows.push({
      ...base,
      id: newId("fnd"),
      label: "hypothesis",
      title: f.hypotheses[0] ?? "Cause unknown",
      body: JSON.stringify({ hypotheses: f.hypotheses, nextAction: f.nextAction }),
      evidence,
    });
    if (f.historical) rows.push({ ...base, id: newId("fnd"), label: "historically_associated", title: f.historical, body: "", evidence });
  }
  if (rows.length) await d.insert(schema.findings).values(rows);
  await advanceStage(id, "published");
  await logEvent(id, "analytics.ingested", { curveId, anomalies: analysis.anomalies.length });
  return { curveId, analysis, read: read.data, model: read.model, trace: read.trace, lessons: ctx.lessonList };
}
