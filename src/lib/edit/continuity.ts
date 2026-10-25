import type { TimeRange, TimelineSegmentMap, Transcript } from "@/lib/db/schema";
import { formatClock } from "./export";

/** How close a cut must be to a sentence boundary or pause to count as clean. */
const TOLERANCE = 0.25;

/**
 * Flags cut points likely to clip speech: a cut is clean when it lands in a
 * detected pause or near a transcript segment boundary.
 */
export function cutWarnings(cuts: number[], transcript: Transcript | null, silences: TimeRange[], duration: number): Map<number, string> {
  const warnings = new Map<number, string>();
  for (const t of cuts) {
    if (t <= TOLERANCE || t >= duration - TOLERANCE) continue;
    if (silences.some((s) => t >= s.start - TOLERANCE && t <= s.end + TOLERANCE)) continue;
    if (!transcript) continue;
    const inside = transcript.segments.find((s) => t > s.start + TOLERANCE && t < s.end - TOLERANCE);
    if (inside) warnings.set(t, `Cut at ${formatClock(t)} lands mid-sentence (“${inside.text.slice(0, 60)}”)`);
  }
  return warnings;
}

/** Warnings for every join in a compiled timeline. */
export function timelineWarnings(segments: TimelineSegmentMap[], transcript: Transcript | null, silences: TimeRange[], duration: number): string[] {
  const cuts = new Set<number>();
  segments.forEach((s, i) => {
    if (i > 0 || s.sourceIn > 0) cuts.add(s.sourceIn);
    if (i < segments.length - 1 || s.sourceOut < duration) cuts.add(s.sourceOut);
  });
  return [...cutWarnings([...cuts], transcript, silences, duration).values()];
}

/**
 * Moves a cut point onto the nearest clean place to cut: the middle of a
 * detected pause if one is within `window` seconds (silence is reliable even
 * when transcript timings are fuzzy), otherwise the nearest transcript
 * segment boundary.
 */
export function snapToBoundary(t: number, transcript: Transcript | null, silences: TimeRange[], window = 1.0): number {
  const nearest = (candidates: number[], within: number) => {
    let best: number | null = null;
    for (const c of candidates) if (Math.abs(c - t) <= within && (best == null || Math.abs(c - t) < Math.abs(best - t))) best = c;
    return best;
  };
  const inPause = silences.find((s) => t >= s.start && t <= s.end);
  if (inPause) return Math.round(t * 1000) / 1000;
  const pause = nearest(silences.filter((s) => s.end - s.start >= 0.15).map((s) => (s.start + s.end) / 2), window);
  const boundary = pause ?? nearest(transcript?.segments.flatMap((s) => [s.start, s.end]) ?? [], window * 0.75);
  return Math.round((boundary ?? t) * 1000) / 1000;
}
