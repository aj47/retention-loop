import { z } from "zod";
import { body, notFound, route } from "@/lib/api";
import { compilePlan, getPlan, requestRender } from "@/lib/edit/service";

type Ctx = { params: Promise<{ planId: string }> };

/** Current compiled timeline for the enabled operations (no rendering). */
export const GET = route<Ctx>(async (_req, { params }) => {
  const { planId } = await params;
  const found = (await getPlan(planId)) ?? notFound("Plan not found");
  return compilePlan(found.operations, found.asset);
});

export const POST = route<Ctx>(async (req, { params }) => {
  const { planId } = await params;
  const { full } = await body(req, z.object({ full: z.boolean().default(false) }));
  return requestRender(planId, full);
});
