import { z } from "zod";
import { body, notFound, route } from "@/lib/api";
import { updateOperation } from "@/lib/edit/service";

type Ctx = { params: Promise<{ opId: string }> };

const Patch = z.object({
  enabled: z.boolean().optional(),
  sourceIn: z.number().min(0).optional(),
  sourceOut: z.number().min(0).optional(),
  targetAt: z.number().min(0).optional(),
  reviewStatus: z.enum(["proposed", "accepted", "rejected"]).optional(),
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { opId } = await params;
  const patch = await body(req, Patch);
  if (patch.reviewStatus === "rejected") patch.enabled = false;
  return { operation: (await updateOperation(opId, patch)) ?? notFound("Operation not found") };
});
