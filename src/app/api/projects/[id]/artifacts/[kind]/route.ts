import { z } from "zod";
import { body, route } from "@/lib/api";
import { addVersion, advanceStage, getOrCreateArtifact } from "@/lib/projects/service";

type Ctx = { params: Promise<{ id: string; kind: string }> };

const TITLES = { idea: "Idea", brief: "Creative brief", script: "Script", shot_plan: "Shot plan" } as const;

/** Saves a creator edit as a new current version. */
export const PUT = route<Ctx>(async (req, { params }) => {
  const { id, kind: rawKind } = await params;
  const kind = z.enum(["idea", "brief", "script", "shot_plan"]).parse(rawKind);
  const input = await body(req, z.object({ content: z.string(), label: z.string().optional(), data: z.record(z.string(), z.unknown()).optional() }));
  const artifact = await getOrCreateArtifact(id, kind, TITLES[kind]);
  const version = await addVersion(artifact, { origin: "creator", label: input.label ?? "Edited", content: input.content, data: input.data });
  if (kind === "script") await advanceStage(id, "script");
  return { version };
});
