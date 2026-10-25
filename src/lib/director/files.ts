import type { GeminiFileRef } from "@/lib/db/schema";
import { gemini } from "./model";

/** Uploaded files expire after 48 hours; re-upload a little before that. */
const LIFETIME_MS = 46 * 60 * 60 * 1000;

export function isFresh(ref: GeminiFileRef | null | undefined): ref is GeminiFileRef {
  return Boolean(ref && new Date(ref.expiresAt).getTime() > Date.now());
}

/** Uploads a local video to the Gemini Files API and waits until it is ready to reference. */
export async function uploadVideo(path: string, mimeType = "video/mp4"): Promise<GeminiFileRef> {
  const ai = gemini();
  let file = await ai.files.upload({ file: path, config: { mimeType } });
  while (file.state === "PROCESSING") {
    await new Promise((r) => setTimeout(r, 2000));
    file = await ai.files.get({ name: file.name! });
  }
  if (file.state === "FAILED" || !file.uri) throw new Error("Gemini could not process the video file");
  return { name: file.name!, uri: file.uri, mimeType: file.mimeType ?? mimeType, expiresAt: new Date(Date.now() + LIFETIME_MS).toISOString() };
}
