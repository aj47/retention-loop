import { z } from "zod";
import { body, directorContext, notFound, route } from "@/lib/api";
import { expandBrief } from "@/lib/director";
import { DirectionSchema } from "@/lib/director/schemas";
import { addVersion, getOrCreateArtifact, getProjectBundle, recordFeedback, updateProject } from "@/lib/projects/service";
import { briefToText } from "@/lib/script/format";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const input = await body(req, z.object({ directions: z.array(DirectionSchema).min(1), notes: z.string().optional() }));
  const bundle = (await getProjectBundle(id)) ?? notFound("Project not found");
  const idea = bundle.artifacts.idea?.current?.content || bundle.project.intent || bundle.project.title;
  const ctx = await directorContext(`${idea} ${input.directions.map((d) => d.title).join(" ")}`);
  const result = await expandBrief({ idea, directions: input.directions, notes: input.notes }, ctx);
  const artifact = await getOrCreateArtifact(id, "brief", "Creative brief");
  const version = await addVersion(artifact, {
    origin: "director",
    label: `Brief from ${input.directions.map((d) => d.title).join(" + ")}`,
    content: briefToText(result.data),
    data: { brief: result.data, directions: input.directions },
    model: result.model,
  });
  for (const d of input.directions) await recordFeedback({ projectId: id, targetType: "direction", targetId: d.title, decision: "accepted" });
  await updateProject(id, { title: result.data.workingTitle, audience: result.data.intendedViewer });
  return { version, model: result.model };
});
