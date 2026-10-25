import { z } from "zod";
import { body, notFound, route } from "@/lib/api";
import { deleteProject, getProjectBundle, updateProject } from "@/lib/projects/service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  return (await getProjectBundle(id)) ?? notFound("Project not found");
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const patch = await body(req, z.object({ title: z.string().min(1).optional(), intent: z.string().optional(), audience: z.string().optional() }));
  await updateProject(id, patch);
  return { ok: true };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  await deleteProject(id);
  return { ok: true };
});
