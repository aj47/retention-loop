import { asc, eq } from "drizzle-orm";
import path from "node:path";
import { db, schema } from "@/lib/db";
import type { VerificationAdjustment } from "@/lib/db/schema";
import { processingFor, verifyCut, videoPart } from "@/lib/director";
import { isFresh, uploadVideo } from "@/lib/director/files";
import { directorMode } from "@/lib/director/model";
import { timelineWarnings } from "@/lib/edit/continuity";
import { requestRender } from "@/lib/edit/service";
import { newId } from "@/lib/ids";
import { detectSilences, makeProxy, probe, renderTimeline, transcribe } from "@/lib/media/ffmpeg";
import { mediaDir } from "@/lib/paths";
import { logEvent } from "@/lib/projects/service";
import { enqueue } from "./runner";

/** Rounds of render → watch → adjust before handing the cut back to the creator. */
export const MAX_VERIFY_ROUNDS = 3;

export function proxyPath(assetId: string) {
  return path.join(mediaDir(assetId), "proxy.mp4");
}

export function renderPath(assetId: string, renderId: string, full: boolean) {
  return path.join(mediaDir(assetId), `${renderId}${full ? "-full" : ""}.mp4`);
}

/** The asset's proxy on the Gemini Files API, uploading again if the previous upload expired. */
export async function ensureGeminiFile(assetId: string) {
  const d = await db();
  const [asset] = await d.select().from(schema.sourceAssets).where(eq(schema.sourceAssets.id, assetId));
  if (isFresh(asset.geminiFile)) return asset.geminiFile;
  const ref = await uploadVideo(proxyPath(assetId));
  await d.update(schema.sourceAssets).set({ geminiFile: ref }).where(eq(schema.sourceAssets.id, assetId));
  return ref;
}

export async function prepareMedia(assetId: string, stage: (s: string) => Promise<void>) {
  const d = await db();
  const [asset] = await d.select().from(schema.sourceAssets).where(eq(schema.sourceAssets.id, assetId));
  if (!asset) throw new Error("Asset not found");

  await stage("Preparing media");
  const info = await probe(asset.path);
  await d.update(schema.sourceAssets).set({ probe: info }).where(eq(schema.sourceAssets.id, assetId));
  await makeProxy(asset.path, proxyPath(assetId), info);

  // The Gemini upload and local audio analysis are independent; run them together.
  const upload = directorMode() === "gemini" && info.hasVideo ? ensureGeminiFile(assetId) : Promise.resolve(null);
  let silences = asset.silences ?? [];
  if (info.hasAudio) {
    await stage("Sending video to Gemini 4 Argon · analyzing audio");
    silences = await detectSilences(asset.path);
    await d.update(schema.sourceAssets).set({ silences }).where(eq(schema.sourceAssets.id, assetId));

    await stage("Sending video to Gemini 4 Argon · transcribing");
    const transcript = await transcribe(asset.path, info.duration);
    await d.update(schema.sourceAssets).set({ transcript }).where(eq(schema.sourceAssets.id, assetId));
  }
  await upload;
  await logEvent(asset.projectId, "video.prepared", { assetId, duration: info.duration });
  return { duration: info.duration, silences: silences.length };
}

export async function renderPlan(renderId: string, full: boolean, verifyRound: number, stage: (s: string) => Promise<void>) {
  const d = await db();
  const [render] = await d.select().from(schema.renders).where(eq(schema.renders.id, renderId));
  if (!render) throw new Error("Render not found");
  const [plan] = await d.select().from(schema.editPlans).where(eq(schema.editPlans.id, render.planId));
  const [asset] = await d.select().from(schema.sourceAssets).where(eq(schema.sourceAssets.id, plan.sourceAssetId));
  if (!asset.probe) throw new Error("Source media has not been prepared");

  await stage(full ? "Rendering full resolution" : "Rendering preview");
  const out = renderPath(asset.id, render.id, full);
  // Previews cut the 540p proxy for speed; full renders read the original.
  await renderTimeline(full ? asset.path : proxyPath(asset.id), out, render.timeline, asset.probe, !full);
  if (!full) await d.update(schema.renders).set({ path: out }).where(eq(schema.renders.id, renderId));
  await logEvent(asset.projectId, full ? "render.exported" : "preview.rendered", { renderId, planId: plan.id });
  if (!full && directorMode() === "gemini" && asset.probe.hasVideo && verifyRound <= MAX_VERIFY_ROUNDS) {
    await enqueue("verify_render", { renderId, round: verifyRound }, asset.projectId);
  }
  return { path: out };
}

/**
 * Argon watches its own rendered cut next to the original. Failed checks with
 * a concrete fix adjust the operations and trigger another render and
 * verification round, up to MAX_VERIFY_ROUNDS.
 */
export async function verifyRender(renderId: string, round: number, stage: (s: string) => Promise<void>) {
  const d = await db();
  const [render] = await d.select().from(schema.renders).where(eq(schema.renders.id, renderId));
  if (!render?.path) throw new Error("Render not ready");
  const [plan] = await d.select().from(schema.editPlans).where(eq(schema.editPlans.id, render.planId));
  const [asset] = await d.select().from(schema.sourceAssets).where(eq(schema.sourceAssets.id, plan.sourceAssetId));
  const operations = await d.select().from(schema.editOperations).where(eq(schema.editOperations.planId, plan.id)).orderBy(asc(schema.editOperations.ordinal));

  await stage(`Argon is watching its cut (round ${round})`);
  const original = await ensureGeminiFile(asset.id);
  const rendered = await uploadVideo(render.path);
  const applied = operations.filter((o) => render.operationIds.includes(o.id));
  const mode = processingFor(asset.probe!.duration);
  const result = await verifyCut({
    original: videoPart(original.uri, original.mimeType, mode),
    render: videoPart(rendered.uri, rendered.mimeType, mode),
    treatment: plan.treatment,
    operations: applied.map((o, index) => ({ index, type: o.type, title: o.title, sourceIn: o.sourceIn, sourceOut: o.sourceOut, targetAt: o.targetAt })),
    timeline: render.timeline,
    knownIssues: timelineWarnings(render.timeline, asset.transcript, asset.silences ?? [], asset.probe!.duration),
    round,
    durationSeconds: asset.probe!.duration,
  });

  const passed = result.data.checks.every((c) => c.passed);
  const adjustments: VerificationAdjustment[] = [];
  if (!passed && round < MAX_VERIFY_ROUNDS) {
    for (const fix of result.data.fixes) {
      const op = applied[fix.operationIndex];
      if (!op || op.executability !== "direct" || fix.value < 0 || fix.value > asset.probe!.duration) continue;
      if (Math.abs((op[fix.field] ?? -1) - fix.value) < 0.05) continue;
      adjustments.push({ operationId: op.id, field: fix.field, from: op[fix.field], to: Math.round(fix.value * 100) / 100, reason: fix.reason });
      await d
        .update(schema.editOperations)
        .set({ [fix.field]: Math.round(fix.value * 100) / 100, warnings: [...op.warnings.filter((w) => !w.startsWith("Adjusted by Argon")), `Adjusted by Argon in verification round ${round}: ${fix.reason}`] })
        .where(eq(schema.editOperations.id, op.id));
    }
  }
  await d.insert(schema.verifications).values({
    id: newId("vrf"),
    planId: plan.id,
    renderId,
    round,
    passed,
    checks: result.data.checks,
    adjustments,
    summary: result.data.summary,
    model: result.model,
  });
  await logEvent(asset.projectId, "cut.verified", { renderId, round, passed, adjustments: adjustments.length });
  if (adjustments.length) await requestRender(plan.id, false, round + 1);
  return { passed, adjustments: adjustments.length };
}
