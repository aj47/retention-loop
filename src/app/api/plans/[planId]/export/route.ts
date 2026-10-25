import { notFound, route } from "@/lib/api";
import { toEdl, toInstructions, toJson, toOtio } from "@/lib/edit/export";
import { compilePlan, getPlan } from "@/lib/edit/service";

type Ctx = { params: Promise<{ planId: string }> };

const FORMATS = {
  json: { fn: toJson, ext: "json", type: "application/json" },
  edl: { fn: toEdl, ext: "edl", type: "text/plain" },
  otio: { fn: toOtio, ext: "otio", type: "application/json" },
  md: { fn: toInstructions, ext: "md", type: "text/markdown" },
} as const;

export const GET = route<Ctx>(async (req, { params }) => {
  const { planId } = await params;
  const format = (new URL(req.url).searchParams.get("format") ?? "json") as keyof typeof FORMATS;
  const f = FORMATS[format] ?? notFound("Unknown export format");
  const found = (await getPlan(planId)) ?? notFound("Plan not found");
  const { plan, operations, asset } = found;
  const compiled = compilePlan(operations, asset);
  const text = f.fn({
    planId,
    treatment: plan.treatment,
    summary: plan.summary,
    sourceName: asset.filename,
    sourcePath: asset.path,
    sourceDuration: asset.probe!.duration,
    fps: asset.probe!.fps ?? 30,
    segments: compiled.segments,
    operations,
  });
  const name = `${plan.treatment.replace(/[^\w-]+/g, "-").toLowerCase()}.${f.ext}`;
  return new Response(text, { headers: { "content-type": `${f.type}; charset=utf-8`, "content-disposition": `attachment; filename="${name}"` } });
});
