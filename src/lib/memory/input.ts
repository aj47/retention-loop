import { z } from "zod";

const Evidence = z.object({ label: z.string(), videoLabel: z.string().optional(), startSeconds: z.number().optional(), endSeconds: z.number().optional(), note: z.string().optional() });

export const LessonInput = z.object({
  claim: z.string().min(3),
  scope: z.object({ formats: z.array(z.string()).optional(), topics: z.array(z.string()).optional(), audience: z.string().optional() }).optional(),
  evidence: z.array(Evidence).optional(),
  counterexamples: z.array(Evidence).optional(),
  status: z.enum(["observation", "hypothesis", "experimentally_supported", "inconclusive", "outdated"]).optional(),
  applicability: z.string().optional(),
  strength: z.enum(["weak", "moderate", "strong"]).optional(),
  suggestedUse: z.string().optional(),
});
