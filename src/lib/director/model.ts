import { ApiError, GoogleGenAI, type GoogleGenAIInteraction } from "@google/genai";
import { z } from "zod";

/** Lead model: every editorial decision, video understanding, verification, and channel memory. */
export const ARGON = process.env.RL_MODEL ?? "gemini-4-argon";
/** Companion for fast, parallel leaf tasks (selection rewrites, shot plans, per-video cards). */
export const FLASH = process.env.RL_FLASH_MODEL ?? "gemini-3.8-flash";
/** Lowest-latency routing. */
export const FLASH_LITE = process.env.RL_LITE_MODEL ?? "gemini-3.5-flash-lite";

export const DIRECTOR_MODEL = ARGON;

export type DirectorMode = "gemini" | "offline";

/**
 * "offline" runs deterministic heuristics so the product works without an
 * API key; every offline output is labelled as such in the UI.
 */
export function directorMode(): DirectorMode {
  const forced = process.env.RL_DIRECTOR_MODE;
  if (forced === "gemini" || forced === "offline") return forced;
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY ? "gemini" : "offline";
}

let client: GoogleGenAI | undefined;
export function gemini(): GoogleGenAI {
  client ??= new GoogleGenAI({});
  return client;
}

export class DirectorError extends Error {}

export type InputPart =
  | { type: "text"; text: string }
  | { type: "video"; uri: string; mime_type?: string; processing?: "agentic" | "static" };

export interface StructuredRequest<S extends z.ZodType> {
  schema: S;
  system: string;
  input: string | InputPart[];
  model?: string;
  thinking?: "low" | "medium" | "high";
  /** Run server-side and poll; use for video and long-context calls. */
  background?: boolean;
  previousInteractionId?: string;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  interactionId: string;
  /** How the model worked: agentic video loads and thought summaries, for the UI trace. */
  trace: { videoLoads: number; thoughts: string[] };
}

const TERMINAL = new Set(["completed", "failed", "cancelled", "incomplete", "requires_action"]);

type Interaction = GoogleGenAIInteraction;

function traceOf(interaction: Interaction): StructuredResult<unknown>["trace"] {
  const steps = (interaction.steps ?? []) as { type: string; summary?: { type: string; text?: string }[] }[];
  return {
    videoLoads: steps.filter((s) => s.type === "processing_call").length,
    thoughts: steps.flatMap((s) => (s.type === "thought" ? (s.summary ?? []).flatMap((x) => (x.text ? [x.text] : [])) : [])).slice(0, 12),
  };
}

/**
 * One Interactions API call constrained to a JSON schema derived from Zod,
 * then validated with the same schema.
 */
export async function structured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<StructuredResult<z.infer<S>>> {
  const ai = gemini();
  const model = req.model ?? ARGON;
  const schema = z.toJSONSchema(req.schema, { target: "draft-2020-12", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  try {
    let interaction = (await ai.interactions.create(
      {
        model,
        input: req.input as never,
        system_instruction: req.system,
        generation_config: { thinking_level: req.thinking ?? "medium", thinking_summaries: "auto" } as never,
        response_format: { type: "text", mime_type: "application/json", schema } as never,
        ...(req.background ? { background: true } : {}),
        ...(req.previousInteractionId ? { previous_interaction_id: req.previousInteractionId } : {}),
      },
      { timeout: 20 * 60 * 1000 },
    )) as Interaction;
    while (!TERMINAL.has(String(interaction.status))) {
      await new Promise((r) => setTimeout(r, 3000));
      interaction = (await ai.interactions.get(interaction.id!)) as Interaction;
    }
    if (interaction.status !== "completed") throw new DirectorError(`Gemini returned status "${interaction.status}".`);
    const text = interaction.output_text;
    if (!text) throw new DirectorError("Gemini returned no output.");
    const parsed = req.schema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new DirectorError("Gemini returned output that did not match the expected shape.");
    return { data: parsed.data, model, interactionId: interaction.id!, trace: traceOf(interaction) };
  } catch (err) {
    if (err instanceof DirectorError) throw err;
    if (err instanceof SyntaxError) throw new DirectorError("Gemini returned malformed JSON.");
    if (err instanceof ApiError) {
      if (err.status === 401 || err.status === 403) throw new DirectorError("The Gemini API key was rejected. Check GEMINI_API_KEY.");
      if (err.status === 429) throw new DirectorError("Rate limited by the Gemini API. Try again shortly.");
      throw new DirectorError(`Gemini API error (${err.status}): ${err.message.slice(0, 300)}`);
    }
    throw err;
  }
}
