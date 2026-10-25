import { body, directorContext, HttpError, notFound, route } from "@/lib/api";
import { z } from "zod";
import { generateShotPlan } from "@/lib/director";
import { addVersion, getOrCreateArtifact, getProjectBundle } from "@/lib/projects/service";
import { shotPlanToText } from "@/lib/script/format";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  await body(req, z.object({}));
  const bundle = (await getProjectBundle(id)) ?? notFound("Project not found");
  const script = bundle.artifacts.script?.current;
  if (!script) throw new HttpError(400, "Write or import a script first");
  const ctx = await directorContext(script.content.slice(0, 2000));
  const result = await generateShotPlan({ script: script.content }, ctx);
  const artifact = await getOrCreateArtifact(id, "shot_plan", "Shot plan");
  const version = await addVersion(artifact, {
    origin: "director",
    label: `From script “${script.label}”`,
    content: shotPlanToText(result.data),
    data: { plan: result.data, scriptVersionId: script.id },
    model: result.model,
  });
  return { version };
});
