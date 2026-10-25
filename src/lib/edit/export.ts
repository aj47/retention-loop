import type { TimelineSegmentMap } from "@/lib/db/schema";

export interface ExportOperation {
  id: string;
  title: string;
  type: string;
  executability: string;
  enabled: boolean;
  sourceIn: number | null;
  sourceOut: number | null;
  targetAt: number | null;
  rationale: string;
  requiredAssets: string[];
  warnings: string[];
}

export interface ExportInput {
  planId: string;
  treatment: string;
  summary: string;
  sourceName: string;
  sourcePath: string;
  sourceDuration: number;
  fps: number;
  segments: TimelineSegmentMap[];
  operations: ExportOperation[];
}

export function formatClock(seconds: number): string {
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const m = Math.floor(tenths / 600);
  const rest = (tenths - m * 600) / 10;
  const sec = Number.isInteger(rest) ? String(rest).padStart(2, "0") : rest.toFixed(1).padStart(4, "0");
  return `${String(m).padStart(2, "0")}:${sec}`;
}

/** Non-drop-frame SMPTE timecode, as used by CMX 3600 EDLs. */
export function timecode(seconds: number, fps: number): string {
  const rate = Math.round(fps);
  const totalFrames = Math.round(seconds * rate);
  const f = totalFrames % rate;
  const totalSeconds = Math.floor(totalFrames / rate);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor(totalSeconds / 60) % 60)}:${pad(totalSeconds % 60)}:${pad(f)}`;
}

export function toJson(input: ExportInput): string {
  return JSON.stringify(
    {
      format: "retention-loop.edit-plan/v1",
      planId: input.planId,
      treatment: input.treatment,
      summary: input.summary,
      source: { name: input.sourceName, duration: input.sourceDuration, fps: input.fps },
      operations: input.operations,
      timeline: input.segments,
    },
    null,
    2,
  );
}

/**
 * CMX 3600 EDL with one video+audio cut event per output segment. EDLs cannot
 * express effects, multiple tracks, or text, so advisory operations appear
 * only as comments.
 */
export function toEdl(input: ExportInput): string {
  const reel = "AX";
  const lines = [`TITLE: ${input.treatment.toUpperCase().slice(0, 60)}`, "FCM: NON-DROP FRAME", ""];
  input.segments.forEach((s, i) => {
    const n = String(i + 1).padStart(3, "0");
    lines.push(
      `${n}  ${reel.padEnd(8)} AA/V  C        ${timecode(s.sourceIn, input.fps)} ${timecode(s.sourceOut, input.fps)} ${timecode(s.outputIn, input.fps)} ${timecode(s.outputOut, input.fps)}`,
      `* FROM CLIP NAME: ${input.sourceName}`,
      "",
    );
  });
  const advisory = input.operations.filter((o) => o.enabled && o.executability !== "direct");
  if (advisory.length) {
    lines.push("* NOT REPRESENTED IN THIS EDL (requires manual work):");
    for (const o of advisory) lines.push(`* - ${o.title}: ${o.rationale}`.slice(0, 250));
  }
  return lines.join("\n");
}

const rational = (seconds: number, rate: number) => ({
  OTIO_SCHEMA: "RationalTime.1",
  rate,
  value: Math.round(seconds * rate),
});

/** OpenTimelineIO JSON with a single video track and a matching audio track. */
export function toOtio(input: ExportInput): string {
  const rate = Math.round(input.fps);
  const clip = (s: TimelineSegmentMap, i: number) => ({
    OTIO_SCHEMA: "Clip.2",
    name: `${input.sourceName} [${i + 1}]`,
    source_range: {
      OTIO_SCHEMA: "TimeRange.1",
      start_time: rational(s.sourceIn, rate),
      duration: rational(s.sourceOut - s.sourceIn, rate),
    },
    media_references: {
      DEFAULT_MEDIA: {
        OTIO_SCHEMA: "ExternalReference.1",
        target_url: `file://${input.sourcePath}`,
        available_range: {
          OTIO_SCHEMA: "TimeRange.1",
          start_time: rational(0, rate),
          duration: rational(input.sourceDuration, rate),
        },
      },
    },
    active_media_reference_key: "DEFAULT_MEDIA",
    effects: [],
    markers: [],
    metadata: {},
  });
  const track = (kind: "Video" | "Audio") => ({
    OTIO_SCHEMA: "Track.1",
    name: kind === "Video" ? "V1" : "A1",
    kind,
    children: input.segments.map(clip),
    effects: [],
    markers: [],
    metadata: {},
  });
  return JSON.stringify(
    {
      OTIO_SCHEMA: "Timeline.1",
      name: input.treatment,
      global_start_time: null,
      metadata: { retention_loop: { planId: input.planId, summary: input.summary } },
      tracks: { OTIO_SCHEMA: "Stack.1", name: "tracks", children: [track("Video"), track("Audio")], effects: [], markers: [], metadata: {} },
    },
    null,
    2,
  );
}

const range = (a: number | null, b: number | null) => (a != null && b != null ? `${formatClock(a)}–${formatClock(b)}` : "—");

export function toInstructions(input: ExportInput): string {
  const out = [`# ${input.treatment}`, "", input.summary, "", `Source: ${input.sourceName} (${formatClock(input.sourceDuration)})`, ""];
  out.push("## Operations", "");
  input.operations
    .filter((o) => o.enabled)
    .forEach((o, i) => {
      const where = o.type === "move" ? `${range(o.sourceIn, o.sourceOut)} → place at ${formatClock(o.targetAt ?? 0)}` : range(o.sourceIn, o.sourceOut);
      out.push(`${i + 1}. **${o.title}** (${o.type}, ${o.executability}) — ${where}`, `   ${o.rationale}`);
      if (o.requiredAssets.length) out.push(`   Needs: ${o.requiredAssets.join(", ")}`);
      for (const w of o.warnings) out.push(`   ⚠ ${w}`);
    });
  out.push("", "## Assembled timeline", "", "| # | Source | Output |", "|---|---|---|");
  input.segments.forEach((s, i) => out.push(`| ${i + 1} | ${range(s.sourceIn, s.sourceOut)} | ${range(s.outputIn, s.outputOut)} |`));
  return out.join("\n");
}
