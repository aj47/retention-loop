import { z } from "zod";
import { body, route } from "@/lib/api";
import { interpret, type InputKind } from "@/lib/director/interpret";
import { addVersion, createProject, getOrCreateArtifact } from "@/lib/projects/service";

const Input = z.object({
  text: z.string().default(""),
  kind: z.enum(["idea", "script", "next", "video"]).optional(),
  title: z.string().optional(),
});

export const POST = route(async (req) => {
  const input = await body(req, Input);
  const guess = interpret(input.text);
  const kind: InputKind = input.kind ?? guess.kind;
  if (kind === "next") return { redirect: "/opportunities" };

  const title = input.title?.trim() || (kind === "video" ? "Untitled video" : guess.title);
  const project = await createProject({
    title,
    intent: kind === "idea" ? input.text.trim() : "",
    stage: kind === "script" ? "script" : kind === "video" ? "rough_cut" : "idea",
  });
  if (kind === "idea") {
    await addVersion(await getOrCreateArtifact(project.id, "idea", "Idea"), { origin: "creator", label: "Original idea", content: input.text.trim() });
  }
  if (kind === "script") {
    await addVersion(await getOrCreateArtifact(project.id, "script", "Script"), { origin: "creator", label: "Imported draft", content: input.text.trim() });
  }
  const view = kind === "script" ? "script" : kind === "video" ? "cut" : "angle";
  return { projectId: project.id, redirect: `/projects/${project.id}?view=${view}`, interpretation: { ...guess, kind } };
});
