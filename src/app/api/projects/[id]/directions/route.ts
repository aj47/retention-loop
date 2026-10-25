import { z } from "zod";
import { body, directorContext, notFound, route } from "@/lib/api";
import { generateDirections } from "@/lib/director";
import { DirectionSchema } from "@/lib/director/schemas";
import { addVersion, getOrCreateArtifact, getProjectBundle } from "@/lib/projects/service";

type Ctx = { params: Promise<{ id: string }> };

const Input = z.object({
  idea: z.string().optional(),
  push: z.string().optional(),
  constraints: z.string().optional(),
  previous: z.array(DirectionSchema).optional(),
});

export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const input = await body(req, Input);
  const bundle = (await getProjectBundle(id)) ?? notFound("Project not found");
  const idea = input.idea?.trim() || bundle.artifacts.idea?.current?.content || bundle.project.intent || bundle.project.title;

  const ideaArtifact = await getOrCreateArtifact(id, "idea", "Idea");
  if (input.idea && input.idea.trim() !== bundle.artifacts.idea?.current?.content) {
    await addVersion(ideaArtifact, { origin: "creator", label: "Edited idea", content: input.idea.trim() });
  }

  const ctx = await directorContext(idea);
  const result = await generateDirections({ idea, push: input.push, constraints: input.constraints, previous: input.previous }, ctx);
  await addVersion(ideaArtifact, {
    origin: "director",
    label: input.push ? `Directions (${input.push})` : "Directions",
    content: idea,
    data: { directions: result.data },
    model: result.model,
    makeCurrent: false,
  });
  return { ...result, lessons: ctx.lessonList };
});
