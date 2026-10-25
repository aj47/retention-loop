import { createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { db, schema } from "@/lib/db";
import { HttpError, notFound, route } from "@/lib/api";
import { newId } from "@/lib/ids";
import { enqueue } from "@/lib/jobs/runner";
import { mediaDir } from "@/lib/paths";
import { advanceStage, getProjectBundle, logEvent } from "@/lib/projects/service";

type Ctx = { params: Promise<{ id: string }> };

/** Streams an uploaded video or audio file to disk and queues preparation. */
export const PUT = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  if (!(await getProjectBundle(id))) notFound("Project not found");
  const url = new URL(req.url);
  const filename = path.basename(url.searchParams.get("filename") ?? "upload.mp4");
  const mime = req.headers.get("content-type") ?? "application/octet-stream";
  if (!/^(video|audio)\//.test(mime)) throw new HttpError(415, "Upload a video or audio file");
  if (!req.body) throw new HttpError(400, "Empty upload");

  const assetId = newId("ast");
  const ext = path.extname(filename) || ".mp4";
  const dest = path.join(mediaDir(assetId), `source${ext}`);
  await pipeline(Readable.fromWeb(req.body as unknown as WebReadableStream), createWriteStream(dest));
  const { size } = await stat(dest);

  const d = await db();
  const [asset] = await d.insert(schema.sourceAssets).values({ id: assetId, projectId: id, filename, path: dest, mime, sizeBytes: size }).returning();
  await logEvent(id, "video.uploaded", { assetId, filename, size });
  await advanceStage(id, "rough_cut");
  const job = await enqueue("prepare_media", { assetId }, id);
  return { asset, job };
});
