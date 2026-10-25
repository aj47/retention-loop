import { body, directorContext, HttpError, notFound, route } from "@/lib/api";
import { z } from "zod";
import { draftScript } from "@/lib/director";
import { addVersion, advanceStage, getOrCreateArtifact, getProjectBundle } from "@/lib/projects/service";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  await body(req, z.object({}));
  const bundle = (await getProjectBundle(id)) ?? notFound("Project not found");
  const brief = bundle.artifacts.brief?.current?.content;
  if (!brief) throw new HttpError(400, "Create a brief first");
  const ctx = await directorContext(brief);
  const result = await draftScript({ brief }, ctx);
  const artifact = await getOrCreateArtifact(id, "script", "Script");
  const version = await addVersion(artifact, { origin: "director", label: "First draft from brief", content: result.data.script, data: { notes: result.data.notes }, model: result.model });
  await advanceStage(id, "script");
  return { version };
});
