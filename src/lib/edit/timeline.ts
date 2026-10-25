import type { EditOperationType, Executability, TimeRange, TimelineSegmentMap } from "@/lib/db/schema";

export interface PlanOperation {
  id: string;
  type: EditOperationType;
  executability: Executability;
  enabled: boolean;
  sourceIn: number | null;
  sourceOut: number | null;
  targetAt: number | null;
}

export interface CompiledTimeline {
  segments: TimelineSegmentMap[];
  duration: number;
  sourceDuration: number;
  appliedOperationIds: string[];
  skipped: { id: string; reason: string }[];
}

/** Segments shorter than this are dropped to avoid single-frame flashes. */
const MIN_SEGMENT = 0.08;
/** Silence kept on each side of a tightened pause. */
const PAUSE_PADDING = 0.15;
/** Only pauses longer than this are tightened. */
const PAUSE_MIN = 0.6;

const round = (t: number) => Math.round(t * 1000) / 1000;

/** Operation types the deterministic renderer can execute from source footage alone. */
export const EXECUTABLE_TYPES: ReadonlySet<EditOperationType> = new Set(["trim", "remove", "move", "tighten_pauses"]);

export function classifyExecutability(type: EditOperationType): Executability {
  if (EXECUTABLE_TYPES.has(type)) return "direct";
  if (type === "overlay_text" || type === "replace") return "partial";
  return "suggested";
}

function subtract(ranges: TimeRange[], cut: TimeRange): TimeRange[] {
  const out: TimeRange[] = [];
  for (const r of ranges) {
    if (cut.end <= r.start || cut.start >= r.end) {
      out.push(r);
      continue;
    }
    if (cut.start > r.start) out.push({ start: r.start, end: cut.start });
    if (cut.end < r.end) out.push({ start: cut.end, end: r.end });
  }
  return out;
}

function pauseCuts(silences: TimeRange[], within: TimeRange): TimeRange[] {
  return silences
    .map((s) => ({ start: Math.max(s.start, within.start), end: Math.min(s.end, within.end) }))
    .filter((s) => s.end - s.start >= PAUSE_MIN)
    .map((s) => ({ start: s.start + PAUSE_PADDING, end: s.end - PAUSE_PADDING }));
}

export function validateOperation(op: PlanOperation, sourceDuration: number): string | null {
  if (!EXECUTABLE_TYPES.has(op.type)) return "Not executable from existing footage";
  if (op.sourceIn == null || op.sourceOut == null) return "Missing source range";
  if (op.sourceIn < 0 || op.sourceOut > sourceDuration + 0.01) return "Source range outside the video";
  if (op.sourceOut - op.sourceIn < MIN_SEGMENT) return "Source range is empty";
  if (op.type === "move") {
    if (op.targetAt == null) return "Move has no destination";
    if (op.targetAt < 0 || op.targetAt > sourceDuration) return "Destination outside the video";
    if (op.targetAt > op.sourceIn && op.targetAt < op.sourceOut) return "Destination is inside the moved segment";
  }
  return null;
}

/**
 * Compiles enabled, directly executable operations into an ordered list of
 * source ranges with their positions in the output. Moves are placed at the
 * source-time position `targetAt` (the segment plays immediately before the
 * footage that originally sat at that time). Removals also apply inside moved
 * segments. The source itself is never modified.
 */
export function compileTimeline(
  operations: PlanOperation[],
  sourceDuration: number,
  silences: TimeRange[] = [],
): CompiledTimeline {
  const skipped: { id: string; reason: string }[] = [];
  const applied: PlanOperation[] = [];
  for (const op of operations) {
    if (!op.enabled) continue;
    const reason = validateOperation(op, sourceDuration);
    if (reason) skipped.push({ id: op.id, reason });
    else applied.push(op);
  }

  const moves: PlanOperation[] = [];
  for (const op of applied.filter((o) => o.type === "move")) {
    const overlap = moves.find((m) => op.sourceIn! < m.sourceOut! && op.sourceOut! > m.sourceIn!);
    if (overlap) skipped.push({ id: op.id, reason: "Overlaps another moved segment" });
    else moves.push(op);
  }
  const appliedIds = new Set(applied.map((o) => o.id));
  for (const s of skipped) appliedIds.delete(s.id);

  let cuts: TimeRange[] = [];
  for (const op of applied) {
    if (!appliedIds.has(op.id)) continue;
    const range = { start: op.sourceIn!, end: op.sourceOut! };
    if (op.type === "remove" || op.type === "trim") cuts.push(range);
    if (op.type === "tighten_pauses") cuts = cuts.concat(pauseCuts(silences, range));
  }
  const applyCuts = (ranges: TimeRange[]) => cuts.reduce(subtract, ranges);

  let main: TimeRange[] = [{ start: 0, end: sourceDuration }];
  for (const m of moves) main = subtract(main, { start: m.sourceIn!, end: m.sourceOut! });

  // Split the main timeline at every move destination, then splice moved
  // segments in before the piece that begins at their destination.
  const anchors = [...new Set(moves.map((m) => m.targetAt!))].sort((x, y) => x - y);
  for (const at of anchors) {
    main = main.flatMap((r) => (at > r.start && at < r.end ? [{ start: r.start, end: at }, { start: at, end: r.end }] : [r]));
  }

  const ordered: TimeRange[] = [];
  const placed = new Set<string>();
  const placeMovesAt = (pos: number) => {
    for (const m of moves) {
      if (placed.has(m.id) || m.targetAt! > pos) continue;
      placed.add(m.id);
      ordered.push(...applyCuts([{ start: m.sourceIn!, end: m.sourceOut! }]));
    }
  };
  for (const r of main) {
    placeMovesAt(r.start);
    ordered.push(...applyCuts([r]));
  }
  placeMovesAt(Number.POSITIVE_INFINITY);

  const segments: TimelineSegmentMap[] = [];
  let cursor = 0;
  for (const r of ordered) {
    const len = r.end - r.start;
    if (len < MIN_SEGMENT) continue;
    const prev = segments.at(-1);
    if (prev && Math.abs(prev.sourceOut - r.start) < 1e-6) {
      prev.sourceOut = round(r.end);
      prev.outputOut = round(cursor + len);
    } else {
      segments.push({ sourceIn: round(r.start), sourceOut: round(r.end), outputIn: round(cursor), outputOut: round(cursor + len) });
    }
    cursor += len;
  }

  return {
    segments,
    duration: round(cursor),
    sourceDuration,
    appliedOperationIds: applied.filter((o) => appliedIds.has(o.id)).map((o) => o.id),
    skipped,
  };
}

export function sourceToOutput(segments: TimelineSegmentMap[], t: number): number | null {
  const s = segments.find((x) => t >= x.sourceIn && t < x.sourceOut);
  return s ? round(s.outputIn + (t - s.sourceIn)) : null;
}

export function outputToSource(segments: TimelineSegmentMap[], t: number): number | null {
  const s = segments.find((x) => t >= x.outputIn && t < x.outputOut);
  return s ? round(s.sourceIn + (t - s.outputIn)) : null;
}

/** Identity of an assembled cut: two plans with the same key render identical output. */
export function timelineKey(segments: TimelineSegmentMap[]): string {
  return segments.map((s) => `${s.sourceIn}-${s.sourceOut}`).join("|");
}
