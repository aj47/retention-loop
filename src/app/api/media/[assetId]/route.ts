import { eq } from "drizzle-orm";
import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { db, schema } from "@/lib/db";
import { notFound, route } from "@/lib/api";
import { proxyPath, renderPath } from "@/lib/jobs/handlers";

type Ctx = { params: Promise<{ assetId: string }> };

/**
 * Serves the playback proxy of a source asset, or one of its renders
 * (?render=<id>, add &full=1 for the full-resolution export), with HTTP
 * range support so players can seek.
 */
export const GET = route<Ctx>(async (req, { params }) => {
  const { assetId } = await params;
  const url = new URL(req.url);
  const renderId = url.searchParams.get("render");
  const full = url.searchParams.get("full") === "1";
  const d = await db();
  const [asset] = await d.select().from(schema.sourceAssets).where(eq(schema.sourceAssets.id, assetId));
  if (!asset) notFound("Asset not found");
  if (renderId && !/^rnd_[a-z0-9]+$/.test(renderId)) notFound("Render not found");

  const file = renderId ? renderPath(assetId, renderId, full) : proxyPath(assetId);
  if (!existsSync(file)) notFound("Media not ready");
  const size = statSync(file).size;
  const headers: Record<string, string> = { "content-type": "video/mp4", "accept-ranges": "bytes", "cache-control": "no-cache" };
  if (full) headers["content-disposition"] = `attachment; filename="${asset.filename.replace(/\.[^.]+$/, "")}-recut.mp4"`;

  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers: { ...headers, "content-length": String(size) } });
});
