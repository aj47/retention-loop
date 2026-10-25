import { eq } from "drizzle-orm";
import { z } from "zod";
import { body, directorContext, HttpError, notFound, route } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { processingFor, proposeEdit, videoPart } from "@/lib/director";
import { directorMode } from "@/lib/director/model";
import { ensureGeminiFile } from "@/lib/jobs/handlers";
import { createPlanFromProposal, requestRender } from "@/lib/edit/service";
import { getProjectBundle } from "@/lib/projects/service";

type Ctx = { params: Promise<{ id: string }> };

/** Proposes an edit plan for an uploaded video and queues its preview render. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const input = await body(req, z.object({ assetId: z.string(), request: z.string().optional() }));
  const bundle = (await getProjectBundle(id)) ?? notFound("Project not found");
  const d = await db();
  const [asset] = await d.select().from(schema.sourceAssets).where(eq(schema.sourceAssets.id, input.assetId));
  if (!asset || asset.projectId !== id) throw new HttpError(404, "Video not found");
  if (!asset.probe) throw new HttpError(409, "The video is still being prepared");

  const transcriptText = asset.transcript?.segments.map((s) => s.text).join(" ") ?? bundle.project.title;
  const ctx = await directorContext(transcriptText.slice(0, 2000), "long-form");
  const file = directorMode() === "gemini" && asset.probe.hasVideo ? await ensureGeminiFile(asset.id) : null;
  const result = await proposeEdit(
    {
      video: file ? videoPart(file.uri, file.mimeType, processingFor(asset.probe.duration)) : undefined,
      transcript: asset.transcript,
      silences: asset.silences ?? [],
      duration: asset.probe.duration,
      script: bundle.artifacts.script?.current?.content,
      request: input.request,
    },
    ctx,
  );
  const planId = await createPlanFromProposal({ projectId: id, asset, proposal: result.data, model: result.model, interactionId: result.interactionId, trace: result.trace });
  const render = await requestRender(planId);
  return { planId, render, model: result.model };
});
