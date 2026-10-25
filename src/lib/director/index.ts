import type { TimeRange, Transcript } from "@/lib/db/schema";
import type { RetentionAnalysis } from "@/lib/analytics/retention";
import { formatClock } from "@/lib/edit/export";
import type { z } from "zod";
import { DirectorError, directorMode, FLASH, structured, type InputPart } from "./model";
import * as offline from "./offline";
import {
  BriefSchema,
  DirectionsSchema,
  DraftSchema,
  EditProposalSchema,
  RewriteSchema,
  SelectionAlternativesSchema,
  ShotPlanSchema,
  VerificationSchema,
  ViewerReadSchema,
  type Brief,
  type Direction,
  type Directions,
  type Draft,
  type EditProposal,
  type Rewrite,
  type ShotPlan,
  type Verification,
  type ViewerRead,
} from "./schemas";

export interface DirectorContext {
  channel: string;
  lessons: string;
}

export interface DirectorResult<T> {
  data: T;
  /** Model id, or "offline" when produced by local heuristics. */
  model: string;
  interactionId?: string;
  trace?: { videoLoads: number; thoughts: string[] };
}

const SYSTEM = `You are the AI Director inside Retention Loop, working with a YouTube creator on their own material.

How you work:
- Produce tangible creative output the creator can use directly: directions, rewritten passages, shot plans, edit operations. Do not lecture.
- Preserve the creator's voice, factual meaning, and necessary technical detail. Never exaggerate claims, invent results, or add sensationalist hooks the material does not support.
- Channel lessons are guidance, not rules. Cite a lesson by its ID only when it genuinely informed a choice. Never invent channel history, metrics, or lessons.
- Be honest about uncertainty. Retention data shows where viewers left, not why. Keep observations, hypotheses, and historical associations clearly separate.
- Offer real exploration as well as optimization: at least one option should go somewhere the channel has not been.`;

const context = (ctx: DirectorContext) => `<channel>\n${ctx.channel}\n</channel>\n\n<channel_lessons>\n${ctx.lessons}\n</channel_lessons>`;

export const DIRECTION_PUSHES = ["more original", "more practical", "more entertaining", "more technical", "more surprising"] as const;

export async function generateDirections(
  input: { idea: string; constraints?: string; push?: string; previous?: Direction[] },
  ctx: DirectorContext,
): Promise<DirectorResult<Directions>> {
  if (directorMode() === "offline") return { data: offline.directions(input.idea, input.push), model: "offline" };
  const prompt = `${context(ctx)}

<idea>
${input.idea}
</idea>
${input.constraints ? `\n<constraints>\n${input.constraints}\n</constraints>\n` : ""}${input.push ? `\nThe creator asked for directions that are ${input.push}.\n` : ""}${
    input.previous?.length ? `\nThe creator has already seen these; propose different ones:\n${input.previous.map((d) => `- ${d.title}: ${d.premise}`).join("\n")}\n` : ""
  }
Propose exactly three meaningfully different editorial treatments for this video. They should differ in premise and structure, not just wording. Mark at least one as "explore".`;
  const r = await structured({ schema: DirectionsSchema, system: SYSTEM, input: prompt });
  return { data: r.data, model: r.model };
}

export async function expandBrief(input: { idea: string; directions: Direction[]; notes?: string }, ctx: DirectorContext): Promise<DirectorResult<Brief>> {
  if (directorMode() === "offline") return { data: offline.brief(input.idea, input.directions), model: "offline" };
  const prompt = `${context(ctx)}

<idea>
${input.idea}
</idea>

<selected_directions>
${input.directions.map((d) => JSON.stringify(d)).join("\n")}
</selected_directions>
${input.notes ? `\n<creator_notes>\n${input.notes}\n</creator_notes>\n` : ""}
Write an editable one-page creative brief. If more than one direction is selected, combine their strongest elements into one coherent video rather than listing them side by side.`;
  const r = await structured({ schema: BriefSchema, system: SYSTEM, input: prompt });
  return { data: r.data, model: r.model };
}

export async function draftScript(input: { brief: string }, ctx: DirectorContext): Promise<DirectorResult<Draft>> {
  if (directorMode() === "offline") return { data: offline.draft(input.brief), model: "offline" };
  const prompt = `${context(ctx)}

<creative_brief>
${input.brief}
</creative_brief>

Write a first-draft spoken script that follows this brief. Write in the creator's voice as described by the channel profile, mark places that need real footage or results with [bracketed notes] instead of inventing outcomes, and keep each paragraph to one beat.

Then give recording tips for this specific video: what to capture, what to set up off camera, and what to avoid on screen, each tied to what this channel's retention history shows.`;
  const r = await structured({ schema: DraftSchema, system: SYSTEM, input: prompt, thinking: "high" });
  return { data: r.data, model: r.model };
}

export const TREATMENTS = {
  payoff_first: "Payoff first: show the result or most compelling moment before the setup.",
  curiosity: "Curiosity-driven: open a specific question early and pay it off deliberately.",
  challenge: "Challenge-driven: frame the video around a concrete challenge with stakes.",
  concise: "More concise: same structure, cut repetition and setup, keep every fact.",
} as const;
export type Treatment = keyof typeof TREATMENTS | "custom";

export async function rewriteScript(
  input: { script: string; treatment: Treatment; custom?: string; locked: string[]; brief?: string },
  ctx: DirectorContext,
): Promise<DirectorResult<Rewrite>> {
  if (directorMode() === "offline") return { data: offline.rewrite(input.script, input.treatment, input.locked), model: "offline" };
  const direction = input.treatment === "custom" ? input.custom || "Improve the script." : TREATMENTS[input.treatment];
  const prompt = `${context(ctx)}
${input.brief ? `\n<creative_brief>\n${input.brief}\n</creative_brief>\n` : ""}
<script>
${input.script}
</script>
${
  input.locked.length
    ? `\n<locked_passages>\nThe creator locked these paragraphs. Copy each one verbatim into the revision; you may move them but not change them.\n${input.locked.map((p) => `---\n${p}`).join("\n")}\n</locked_passages>\n`
    : ""
}
Treatment: ${direction}

Write a complete revised script. Keep paragraphs separated by blank lines and keep paragraphs that do not need to change identical to the original, so the creator can accept changes one by one. Explain each substantive change by its editorial purpose.`;
  const r = await structured({ schema: RewriteSchema, system: SYSTEM, input: prompt, thinking: "high" });
  return { data: r.data, model: r.model };
}

export const SELECTION_ACTIONS = [
  "Make tighter",
  "Make more compelling",
  "Simplify",
  "Increase suspense",
  "Improve transition",
  "Show the result sooner",
  "Preserve my tone",
] as const;

export async function rewriteSelection(
  input: { script: string; selection: string; action: string },
  ctx: DirectorContext,
): Promise<DirectorResult<{ alternatives: string[] }>> {
  if (directorMode() === "offline") return { data: offline.selection(input.selection, input.action), model: "offline" };
  const prompt = `${context(ctx)}

<script>
${input.script}
</script>

<selected_passage>
${input.selection}
</selected_passage>

Instruction: ${input.action}. Return three alternative versions of only the selected passage that fit seamlessly into the surrounding script.`;
  const r = await structured({ schema: SelectionAlternativesSchema, system: SYSTEM, input: prompt, model: FLASH, thinking: "low" });
  return { data: r.data, model: r.model };
}

export async function generateShotPlan(input: { script: string }, ctx: DirectorContext): Promise<DirectorResult<ShotPlan>> {
  if (directorMode() === "offline") return { data: offline.shotPlan(input.script), model: "offline" };
  const prompt = `${context(ctx)}

<script>
${input.script}
</script>

Turn this approved script into a shot plan. Every shot quotes the exact script passage it covers so the plan stays traceable to the script. Estimate seconds from speaking pace (about 150 words per minute) plus demo time.`;
  const r = await structured({ schema: ShotPlanSchema, system: SYSTEM, input: prompt, model: FLASH });
  return { data: r.data, model: r.model };
}

const transcriptText = (t: Transcript) => t.segments.map((s) => `[${s.start.toFixed(1)}–${s.end.toFixed(1)}] ${s.text.trim()}`).join("\n");

/** Video part for a model call: agentic processing lets the model navigate the timeline itself. */
export function videoPart(uri: string, mimeType?: string, processing: "agentic" | "static" = "agentic"): InputPart {
  return { type: "video", uri, ...(mimeType ? { mime_type: mimeType } : {}), processing };
}

/**
 * Clips under five minutes are cheaper and faster to read in one static pass
 * (Google's guidance); longer videos use agentic navigation of the timeline.
 */
export const SHORT_VIDEO_SECONDS = 300;
export const processingFor = (durationSeconds: number) => (durationSeconds < SHORT_VIDEO_SECONDS ? "static" : "agentic");

export async function proposeEdit(
  input: { transcript: Transcript | null; silences: TimeRange[]; duration: number; script?: string; request?: string; video?: InputPart },
  ctx: DirectorContext,
): Promise<DirectorResult<EditProposal>> {
  if (directorMode() === "offline" || (!input.transcript && !input.video)) {
    return { data: offline.editProposal(input.transcript, input.silences, input.duration), model: "offline" };
  }
  const longPauses = input.silences.filter((s) => s.end - s.start >= 0.6);
  const prompt = `${context(ctx)}

<video duration_seconds="${input.duration.toFixed(1)}">
${input.video ? "The full video is attached. Watch it: look at what is on screen as well as what is said.\n" : ""}<transcript>
${input.transcript ? transcriptText(input.transcript) : "(no transcript; rely on the video)"}
</transcript>
<pauses count="${longPauses.length}">
${longPauses
  .slice(0, 80)
  .map((s) => `${s.start.toFixed(1)}–${s.end.toFixed(1)}`)
  .join(", ")}
</pauses>
</video>
${input.script ? `\n<intended_script>\n${input.script}\n</intended_script>\n` : ""}${input.request ? `\nCreator request: ${input.request}\n` : ""}
Propose a better cut of this video using its existing footage. Rules:
- First record observations: the moments you saw or heard that drive the plan (where the payoff is visible, dead screens, repeated explanations, slow setup, strong reactions), with timestamps.
- Use only these operation types for changes that can be made from existing footage: trim / remove (cut a source range), move (play source range before source time targetAt), tighten_pauses (shorten long pauses inside a range).
- Use insert, replace, or overlay_text for anything needing new footage, voiceover, or graphics, and list what the creator must supply in requiredAssets.
- Cut on sentence boundaries so speech is not clipped, and avoid cutting in the middle of an on-screen action. Keep moved segments self-contained (a complete thought).
- Preserve necessary technical explanation; prefer moving it later over deleting it.
- Times are seconds in the source video.${input.script ? "\n- Use the intended script to note scenes that were omitted, moved, or promises left unresolved in continuity." : ""}`;
  const r = await callWithVideo(EditProposalSchema, prompt, input.video, input.duration < SHORT_VIDEO_SECONDS ? "medium" : "high");
  return { data: r.data, model: r.model, interactionId: r.interactionId, trace: r.trace };
}

/** Sends a video with the prompt; falls back to static frame sampling if agentic processing is refused. */
async function callWithVideo<S extends z.ZodType>(schema: S, prompt: string, video: InputPart | undefined, thinking: "low" | "medium" | "high") {
  if (!video) return structured({ schema, system: SYSTEM, input: prompt, thinking });
  try {
    return await structured({ schema, system: SYSTEM, input: [video, { type: "text", text: prompt }], thinking, background: true });
  } catch (err) {
    if (!(err instanceof DirectorError) || !/agentic|processing|400/i.test(err.message)) throw err;
    const { processing: _p, ...staticVideo } = video as Extract<InputPart, { type: "video" }>;
    void _p;
    return structured({ schema, system: SYSTEM, input: [staticVideo, { type: "text", text: prompt }], thinking, background: true });
  }
}

export async function verifyCut(
  input: {
    original: InputPart;
    render: InputPart;
    treatment: string;
    operations: { index: number; type: string; title: string; sourceIn: number | null; sourceOut: number | null; targetAt: number | null }[];
    timeline: { sourceIn: number; sourceOut: number; outputIn: number; outputOut: number }[];
    knownIssues: string[];
    round: number;
    durationSeconds: number;
  },
): Promise<DirectorResult<Verification>> {
  const prompt = `You are verifying a recut you proposed. The first video is the ORIGINAL; the second is the RENDERED recut assembled from it. This is verification round ${input.round}.

Intended treatment: ${input.treatment}

<operations>
${input.operations.map((o) => `${o.index}. ${o.type} "${o.title}" source ${o.sourceIn ?? "-"}–${o.sourceOut ?? "-"}${o.type === "move" ? ` → before ${o.targetAt}` : ""}`).join("\n")}
</operations>

<timeline description="output seconds ← source seconds">
${input.timeline.map((t) => `${t.outputIn.toFixed(1)}–${t.outputOut.toFixed(1)} ← ${t.sourceIn.toFixed(1)}–${t.sourceOut.toFixed(1)}`).join("\n")}
</timeline>
${input.knownIssues.length ? `\n<automated_checks>\n${input.knownIssues.join("\n")}\n</automated_checks>\n` : ""}
Watch the rendered recut and check, at minimum:
1. No clipped words or sentences cut mid-thought at any join.
2. The payoff or most compelling moment lands within the first 20 seconds.
3. No reference to something the viewer has not seen yet (e.g. "as I showed earlier") after reordering.
4. No jarring visual jumps at joins (sudden unrelated screen, half-finished action).
5. The recut still makes sense on its own and keeps necessary explanation.

Report each check with evidence. For failures that can be fixed by moving a cut point, give the smallest fix in SOURCE seconds. Do not propose fixes for checks that passed.`;
  const thinking = input.durationSeconds < SHORT_VIDEO_SECONDS ? "medium" : "high";
  const r = await structured({ schema: VerificationSchema, system: SYSTEM, input: [input.original, input.render, { type: "text", text: prompt }], thinking, background: true });
  return { data: r.data, model: r.model, interactionId: r.interactionId, trace: r.trace };
}

export async function readViewers(
  input: { analysis: RetentionAnalysis; durationSeconds: number; transcript: Transcript | null; video?: InputPart },
  ctx: DirectorContext,
): Promise<DirectorResult<ViewerRead>> {
  const anomalies = input.analysis.anomalies.slice(0, 5);
  if (directorMode() === "offline") return { data: offline.viewerRead(anomalies, input.transcript), model: "offline" };
  const windowText = (from: number, to: number) =>
    input.transcript
      ? input.transcript.segments
          .filter((s) => s.end >= from && s.start <= to)
          .map((s) => `[${s.start.toFixed(1)}] ${s.text.trim()}`)
          .join("\n")
      : input.video
        ? "(watch the attached video for this window)"
        : "(no transcript available)";
  const prompt = `${context(ctx)}
${input.video ? "\nThe published video is attached. Watch each anomaly's context window: what was on screen and what was said just before viewers left or stayed.\n" : ""}
<retention baseline="${input.analysis.baselineSource}" resolution_seconds="${input.analysis.resolutionSeconds}" opening_retention_30s="${input.analysis.openingRetention ?? "n/a"}">
${anomalies
  .map(
    (a, i) => `<anomaly index="${i}" direction="${a.direction}" interval="${formatClock(a.startSeconds)}–${formatClock(a.endSeconds)}" residual_vs_expected="${a.residual}" detectors="${a.detectors.join(",")}">
<context_transcript from="${formatClock(a.contextStartSeconds)}" to="${formatClock(a.contextEndSeconds)}">
${windowText(a.contextStartSeconds, a.contextEndSeconds)}
</context_transcript>
</anomaly>`,
  )
  .join("\n")}
</retention>

<data_limitations>
${input.analysis.limitations.join("\n")}
</data_limitations>

For each anomaly: state what is observed without causal language (include what was on screen if you watched the video), give two to four competing hypotheses (the cause can precede the drop), cite a channel lesson only if one applies, and suggest one concrete next action (a recut, script change, or experiment). Then propose up to three reusable lessons, phrased as hypotheses to test.`;
  const r = await callWithVideo(ViewerReadSchema, prompt, input.video, "medium");
  return { data: r.data, model: r.model, interactionId: r.interactionId, trace: r.trace };
}
