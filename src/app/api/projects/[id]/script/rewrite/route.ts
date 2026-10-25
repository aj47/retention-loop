import { z } from "zod";
import { body, directorContext, HttpError, notFound, route } from "@/lib/api";
import { rewriteScript, TREATMENTS } from "@/lib/director";
import { addVersion, getProjectBundle } from "@/lib/projects/service";
import { lockViolations } from "@/lib/script/diff";

type Ctx = { params: Promise<{ id: string }> };

const Input = z.object({
  treatment: z.enum([...(Object.keys(TREATMENTS) as (keyof typeof TREATMENTS)[]), "custom"]),
  custom: z.string().optional(),
  locked: z.array(z.string()).default([]),
});

/** Generates an alternative as a non-current version; the creator decides what to keep. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const input = await body(req, Input);
  const bundle = (await getProjectBundle(id)) ?? notFound("Project not found");
  const script = bundle.artifacts.script;
  if (!script?.current) throw new HttpError(400, "This project has no script yet");

  const ctx = await directorContext(script.current.content.slice(0, 2000));
  const result = await rewriteScript(
    { script: script.current.content, treatment: input.treatment, custom: input.custom, locked: input.locked, brief: bundle.artifacts.brief?.current?.content },
    ctx,
  );
  const label = input.treatment === "custom" ? `Custom: ${input.custom?.slice(0, 40) ?? ""}` : input.treatment.replace("_", " ");
  const version = await addVersion(script, {
    origin: "director",
    label: `Alternative — ${label}`,
    content: result.data.proposed,
    data: { rewrite: result.data, baseVersionId: script.current.id, locked: input.locked, lockViolations: lockViolations(result.data.proposed, input.locked) },
    model: result.model,
    makeCurrent: false,
  });
  return { version, lessons: ctx.lessonList };
});
