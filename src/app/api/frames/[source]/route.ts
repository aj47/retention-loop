import { eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { HttpError, notFound, route } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { proxyPath, renderPath } from "@/lib/jobs/handlers";
import { fileFrame, youtubeFrame } from "@/lib/youtube/frames";

type Ctx = { params: Promise<{ source: string }> };

/**
 * A still frame at ?t= seconds. `source` is a YouTube video id (storyboard
 * frames), an asset id (its proxy), or an asset id with ?render= (a render).
 */
export const GET = route<Ctx>(async (req, { params }) => {
  const { source } = await params;
  const url = new URL(req.url);
  const t = Number(url.searchParams.get("t") ?? 0);
  if (!Number.isFinite(t) || t < 0) throw new HttpError(400, "Bad time");
  let file: string;
  if (source.startsWith("ast_")) {
    const d = await db();
    const [asset] = await d.select().from(schema.sourceAssets).where(eq(schema.sourceAssets.id, source));
    if (!asset) notFound("Asset not found");
    const renderId = url.searchParams.get("render");
    if (renderId && !/^rnd_[a-z0-9]+$/.test(renderId)) notFound("Render not found");
    file = await fileFrame(renderId ? `${source}-${renderId}` : source, renderId ? renderPath(source, renderId, false) : proxyPath(source), t);
  } else {
    if (!/^[\w-]{11}$/.test(source)) notFound("Unknown video");
    file = await youtubeFrame(source, t);
  }
  return new Response(new Uint8Array(await readFile(file)), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400" } });
});
