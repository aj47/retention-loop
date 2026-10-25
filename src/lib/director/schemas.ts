import { z } from "zod";

export const DirectionSchema = z.object({
  title: z.string().describe("Short concept title, e.g. 'The Real-World Showdown'"),
  premise: z.string().describe("One sentence premise"),
  intendedViewer: z.string(),
  promise: z.string().describe("What the viewer is promised for watching"),
  opening: z.string().describe("Suggested first 1-3 spoken lines"),
  narrative: z.string().describe("Narrative approach in 2-3 sentences"),
  whyInteresting: z.string(),
  mode: z.enum(["optimize", "explore"]).describe("optimize = leans on proven patterns; explore = deliberately unproven"),
  lessonIds: z.array(z.string()).describe("IDs of channel lessons that informed this direction; empty if none"),
});
export type Direction = z.infer<typeof DirectionSchema>;

export const DirectionsSchema = z.object({
  directions: z.array(DirectionSchema).describe("Exactly three meaningfully different editorial treatments"),
  channelNote: z.string().describe("One sentence on how channel history informed these, or that none was available"),
});
export type Directions = z.infer<typeof DirectionsSchema>;

export const BriefSchema = z.object({
  workingTitle: z.string(),
  premise: z.string(),
  intendedViewer: z.string(),
  promise: z.string(),
  opening: z.string(),
  outline: z.array(z.object({ beat: z.string(), purpose: z.string() })),
  tone: z.string(),
  risks: z.array(z.string()),
});
export type Brief = z.infer<typeof BriefSchema>;

export const RewriteSchema = z.object({
  proposed: z.string().describe("The full revised script. Paragraphs separated by blank lines. Locked passages copied verbatim."),
  summary: z.string().describe("One or two sentences on the editorial purpose of this revision"),
  changes: z.array(
    z.object({
      purpose: z.string().describe("Specific editorial purpose, e.g. 'Moves the central comparison into the opening'"),
      excerpt: z.string().describe("Short quote from the revised script this change produced"),
      lessonIds: z.array(z.string()),
    }),
  ),
  beats: z.array(z.object({ name: z.string(), summary: z.string() })).describe("Narrative beats of the revised script, in order"),
  diagnostics: z.array(
    z.object({
      aspect: z.enum(["hook", "promise", "setup_length", "progression", "payoff", "repetition", "density", "demo_timing", "transitions", "ending"]),
      observation: z.string(),
    }),
  ).describe("Structural observations about the ORIGINAL script"),
});
export type Rewrite = z.infer<typeof RewriteSchema>;

export const SelectionAlternativesSchema = z.object({
  alternatives: z.array(z.string()).describe("Three alternative versions of the selected passage"),
});

export const ShotPlanSchema = z.object({
  shots: z.array(
    z.object({
      beat: z.string(),
      scriptExcerpt: z.string().describe("The exact script passage this shot covers"),
      shot: z.string().describe("What the camera/screen shows"),
      broll: z.string().describe("B-roll suggestion, or empty"),
      onScreenText: z.string().describe("On-screen text, or empty"),
      estimatedSeconds: z.number(),
    }),
  ),
  checklist: z.array(z.string()).describe("Production checklist items"),
});
export type ShotPlan = z.infer<typeof ShotPlanSchema>;

export const ProposedOperationSchema = z.object({
  type: z.enum(["trim", "remove", "move", "tighten_pauses", "insert", "replace", "overlay_text"]),
  title: z.string(),
  rationale: z.string(),
  sourceIn: z.number().nullable().describe("Seconds in the source video; null for insert"),
  sourceOut: z.number().nullable(),
  targetAt: z.number().nullable().describe("For move: source-time position the segment should play before (0 = very start). Otherwise null."),
  requiredAssets: z.array(z.string()).describe("Footage/voiceover/graphics the creator must supply; empty if none"),
  lessonIds: z.array(z.string()),
});

export const EditProposalSchema = z.object({
  treatment: z.string().describe("Name of the treatment, e.g. 'Payoff-first opening'"),
  summary: z.string(),
  observations: z
    .array(z.object({ atSeconds: z.number(), note: z.string().describe("What is on screen or heard at this moment that matters for the edit") }))
    .describe("What you saw and heard in the footage that drove the plan, with timestamps. Empty if no video was provided."),
  operations: z.array(ProposedOperationSchema),
  continuity: z.array(z.string()).describe("Script-to-footage observations: omitted scenes, moved demos, unresolved promises. Empty if no script."),
});
export type EditProposal = z.infer<typeof EditProposalSchema>;

export const ViewerReadSchema = z.object({
  findings: z.array(
    z.object({
      anomalyIndex: z.number().describe("Index into the anomalies list"),
      observed: z.string().describe("What the data shows, without causal language"),
      hypotheses: z.array(z.string()).describe("Two to four competing explanations"),
      historical: z.string().describe("Relevant channel lesson or comparable pattern; empty if none"),
      nextAction: z.string(),
    }),
  ),
  proposedLessons: z.array(
    z.object({
      claim: z.string(),
      applicability: z.string(),
      suggestedUse: z.string(),
    }),
  ),
});
export type ViewerRead = z.infer<typeof ViewerReadSchema>;

export const DraftSchema = z.object({
  script: z.string().describe("Full spoken script, paragraphs separated by blank lines"),
  notes: z.string().describe("One or two sentences on structural choices"),
});
export type Draft = z.infer<typeof DraftSchema>;

export const VerificationSchema = z.object({
  checks: z.array(
    z.object({
      name: z.string().describe("Short name of the check, e.g. 'Payoff in first 20s'"),
      passed: z.boolean(),
      atSeconds: z.number().nullable().describe("Time in the RENDERED cut where the problem is, or null"),
      evidence: z.string().describe("What you saw or heard that decided this check"),
    }),
  ),
  fixes: z
    .array(
      z.object({
        operationIndex: z.number().describe("Index into the operations list"),
        field: z.enum(["sourceIn", "sourceOut", "targetAt"]),
        value: z.number().describe("New value in SOURCE seconds"),
        reason: z.string(),
      }),
    )
    .describe("Smallest adjustments to the operations that fix the failed checks. Empty if every check passed or nothing can be fixed by adjusting times."),
  summary: z.string(),
});
export type Verification = z.infer<typeof VerificationSchema>;
