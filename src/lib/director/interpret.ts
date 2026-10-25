export type InputKind = "idea" | "script" | "next" | "video";

export interface Interpretation {
  kind: InputKind;
  title: string;
  explanation: string;
}

const NEXT = /^\s*(what should i (make|film|do) next|(give me|suggest) (some )?(video )?ideas|what('?s| is) next)\b/i;

/**
 * Classifies composer input without a model call: long or multi-paragraph
 * text reads as a script, short text as an idea. The UI shows the result and
 * lets the creator change it.
 */
export function interpret(text: string): Interpretation {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  const paragraphs = trimmed.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const firstLine = trimmed.split("\n")[0].replace(/^#+\s*/, "");
  // A heading is a title; otherwise use the first sentence, shortened.
  const firstSentence = /^#/.test(trimmed) ? firstLine : (firstLine.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? firstLine);
  const title = firstSentence.length > 60 ? `${firstSentence.slice(0, 57).trimEnd()}…` : firstSentence || "Untitled";

  if (NEXT.test(trimmed)) return { kind: "next", title: "What to make next", explanation: "Looks like you want ideas for your next video." };
  if (words >= 120 || paragraphs >= 3) {
    return { kind: "script", title, explanation: `Reads like a draft script (${words} words, ${paragraphs} paragraphs).` };
  }
  return { kind: "idea", title, explanation: "Reads like an idea to develop." };
}
