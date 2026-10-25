import { diffArrays, diffWords } from "diff";

export interface WordPart {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export type ScriptBlock =
  | { kind: "same"; paragraphs: string[] }
  | {
      kind: "change";
      id: string;
      original: string[];
      proposed: string[];
      words: WordPart[];
      touchesLocked: boolean;
      /** Other hunks that move text to or from this one; they apply together. */
      linked: string[];
    };

export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function joinParagraphs(paragraphs: string[]): string {
  return paragraphs.join("\n\n");
}

const normalize = (p: string) => p.replace(/\s+/g, " ").trim();

/**
 * Aligns two scripts paragraph by paragraph and groups consecutive removals
 * and additions into reviewable change hunks. Hunk ids are positional so the
 * same pair of texts always yields the same ids.
 */
export function diffScripts(original: string, proposed: string, locked: string[] = []): ScriptBlock[] {
  const a = splitParagraphs(original);
  const b = splitParagraphs(proposed);
  const lockedSet = new Set(locked.map(normalize));
  const parts = diffArrays(a.map(normalize), b.map(normalize));

  const blocks: ScriptBlock[] = [];
  let ai = 0;
  let bi = 0;
  let pendingRemoved: string[] = [];
  let pendingAdded: string[] = [];

  const flush = () => {
    if (!pendingRemoved.length && !pendingAdded.length) return;
    const id = `h${blocks.filter((x) => x.kind === "change").length + 1}`;
    blocks.push({
      kind: "change",
      id,
      original: pendingRemoved,
      proposed: pendingAdded,
      words: diffWords(joinParagraphs(pendingRemoved), joinParagraphs(pendingAdded)),
      touchesLocked: pendingRemoved.some((p) => lockedSet.has(normalize(p))),
      linked: [],
    });
    pendingRemoved = [];
    pendingAdded = [];
  };

  for (const part of parts) {
    const n = part.value.length;
    if (part.removed) {
      pendingRemoved.push(...a.slice(ai, ai + n));
      ai += n;
    } else if (part.added) {
      pendingAdded.push(...b.slice(bi, bi + n));
      bi += n;
    } else {
      flush();
      blocks.push({ kind: "same", paragraphs: a.slice(ai, ai + n) });
      ai += n;
      bi += n;
    }
  }
  flush();
  linkMoves(blocks);
  return blocks;
}

const words = (p: string) => new Set(p.toLowerCase().match(/[a-z0-9']+/g) ?? []);

function similar(a: string, b: string): boolean {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / (wa.size + wb.size - shared) >= 0.6;
}

/**
 * A moved paragraph shows up as an addition in one hunk and a removal in
 * another. Applying only one side would duplicate or drop it, so such hunks
 * are linked (transitively) and merged as a unit.
 */
function linkMoves(blocks: ScriptBlock[]) {
  const hunks = blocks.filter((b): b is Extract<ScriptBlock, { kind: "change" }> => b.kind === "change");
  const parent = new Map(hunks.map((h) => [h.id, h.id]));
  const find = (id: string): string => (parent.get(id) === id ? id : find(parent.get(id)!));
  for (const a of hunks) {
    for (const b of hunks) {
      if (a === b) continue;
      if (a.proposed.some((p) => b.original.some((o) => similar(p, o)))) parent.set(find(a.id), find(b.id));
    }
  }
  for (const h of hunks) h.linked = hunks.filter((o) => o !== h && find(o.id) === find(h.id)).map((o) => o.id);
}

/** Builds a script taking the proposed side only for accepted hunks (linked hunks all-or-nothing). */
export function mergeScript(blocks: ScriptBlock[], acceptedHunkIds: Iterable<string>): string {
  const accepted = new Set(acceptedHunkIds);
  const byId = new Map(blocks.flatMap((b) => (b.kind === "change" ? [[b.id, b] as const] : [])));
  const applies = (b: Extract<ScriptBlock, { kind: "change" }>) =>
    [b.id, ...b.linked].every((id) => accepted.has(id) && !byId.get(id)?.touchesLocked);
  const out: string[] = [];
  for (const block of blocks) {
    if (block.kind === "same") out.push(...block.paragraphs);
    else if (applies(block)) out.push(...block.proposed);
    else out.push(...block.original);
  }
  return joinParagraphs(out);
}

export function changeIds(blocks: ScriptBlock[]): string[] {
  return blocks.flatMap((b) => (b.kind === "change" ? [b.id] : []));
}

/** Locked passages the proposal dropped or altered. */
export function lockViolations(proposed: string, locked: string[]): string[] {
  const present = new Set(splitParagraphs(proposed).map(normalize));
  return locked.filter((p) => !present.has(normalize(p)));
}
