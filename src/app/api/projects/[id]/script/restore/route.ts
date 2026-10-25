import { z } from "zod";
import { body, HttpError, route } from "@/lib/api";
import { getVersion, setCurrentVersion } from "@/lib/projects/service";

export const POST = route(async (req) => {
  const { versionId } = await body(req, z.object({ versionId: z.string() }));
  const v = (await getVersion(versionId)) ?? null;
  if (!v) throw new HttpError(404, "Version not found");
  await setCurrentVersion(v.artifactId, v.id);
  return { ok: true };
});
