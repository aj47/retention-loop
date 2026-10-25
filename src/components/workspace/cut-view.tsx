"use client";

import { useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { TimelineSegmentMap } from "@/lib/db/schema";
import { formatClock } from "@/lib/edit/export";
import { compileTimeline, outputToSource, sourceToOutput, timelineKey } from "@/lib/edit/timeline";
import type { EditOperation, ProjectBundle, SourceAsset } from "@/lib/projects/service";
import { uploadWithProgress } from "../composer";
import { Badge, Button, Card, ErrorNote, ModelTag, Spinner } from "../ui";
import type { WorkspaceProps } from "./workspace";

type Plan = ProjectBundle["plans"][number];
type Mode = "side" | "ab" | "sequential" | "diff";

export function CutView({ bundle, reload }: WorkspaceProps) {
  const pid = bundle.project.id;
  const asset = bundle.assets[0] ?? null;
  const prepJob = bundle.jobs.find((j) => j.type === "prepare_media" && j.payload.assetId === asset?.id);
  const plans = bundle.plans.filter((p) => p.sourceAssetId === asset?.id);
  const [planId, setPlanId] = useState<string | null>(plans[0]?.id ?? null);
  const plan = plans.find((p) => p.id === planId) ?? plans[0] ?? null;
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  async function run<T>(key: string, fn: () => Promise<T>) {
    setBusy(key);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const upload = (file: File) =>
    run("upload", async () => {
      setProgress(0);
      await uploadWithProgress(`/api/projects/${pid}/assets?filename=${encodeURIComponent(file.name)}`, file, setProgress);
      setProgress(null);
      await reload();
    });

  const propose = () =>
    run("propose", async () => {
      const res = await api<{ planId: string }>(`/api/projects/${pid}/cut`, { json: { assetId: asset!.id, request: request || undefined } });
      await reload();
      setPlanId(res.planId);
    });

  if (!asset) {
    return (
      <div className="max-w-2xl">
        <Card className="p-6">
          <p className="font-medium">Upload a rough cut or exported video</p>
          <p className="mt-1 text-sm text-muted">The Director proposes a better cut from your actual footage and renders a preview you can compare. Your original file is never modified.</p>
          <label className="mt-4 flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-line px-4 py-10 text-sm text-muted hover:border-faint">
            {progress != null ? `Uploading ${progress}%` : "Choose a video or audio file"}
            <input type="file" accept="video/*,audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
          <ErrorNote error={error} />
        </Card>
      </div>
    );
  }

  if (!asset.probe || prepJob?.status === "queued" || prepJob?.status === "running" || prepJob?.status === "failed") {
    return (
      <Card className="max-w-2xl p-6">
        <p className="font-medium">{asset.filename}</p>
        {prepJob?.status === "failed" ? (
          <>
            <p className="mt-2 text-sm text-del-ink">{prepJob.stage}: {prepJob.error}</p>
            <Button className="mt-3" onClick={() => run("retry", async () => (await api(`/api/jobs/${prepJob.id}/retry`, { json: {} }), reload()))}>
              Retry
            </Button>
          </>
        ) : (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted">
            <Spinner /> {prepJob?.stage ?? "Preparing media"}… You can keep working on the script while this runs.
          </p>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <ErrorNote error={error} />
      {!plan ? (
        <Card className="max-w-3xl p-5">
          <p className="font-medium">{asset.filename}</p>
          <p className="mt-1 text-sm text-muted">
            {formatClock(asset.probe.duration)} · {asset.probe.width ? `${asset.probe.width}×${asset.probe.height}` : "audio"} ·{" "}
            {asset.transcript ? `${asset.transcript.segments.length} transcript segments (${asset.transcript.engine})` : "no transcript — install Whisper for sentence-aware cuts"} ·{" "}
            {(asset.silences ?? []).length} pauses
          </p>
          <input
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="Optional: what should change? e.g. “get to the demo faster”"
            className="mt-4 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-faint"
          />
          <Button variant="primary" className="mt-3" onClick={propose} busy={busy === "propose"}>
            Propose a better cut
          </Button>
        </Card>
      ) : (
        <PlanWorkspace key={plan.id} plan={plan} asset={asset} bundle={bundle} reload={reload} run={run} busy={busy} />
      )}
      {plans.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-muted">Treatments:</span>
          {plans.map((p) => (
            <button key={p.id} onClick={() => setPlanId(p.id)} className={`rounded-md px-2 py-1 ${p.id === plan?.id ? "bg-card ring-1 ring-line" : "text-muted hover:text-ink"}`}>
              {p.treatment}
            </button>
          ))}
          <input
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="Request a different cut…"
            className="ml-2 min-w-56 rounded-md border border-line px-2 py-1 text-sm outline-none"
          />
          <Button onClick={propose} busy={busy === "propose"} disabled={!!busy}>
            Request a different cut
          </Button>
        </div>
      )}
    </div>
  );
}

// Identity colors for footage segments, in fixed order; moved footage is marked with hatching, not a hue.
const SEGMENT_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const MOVED_TEXTURE = "repeating-linear-gradient(135deg, rgba(255,255,255,0.55) 0 3px, transparent 3px 7px)";

function PlanWorkspace({
  plan,
  asset,
  bundle,
  reload,
  run,
  busy,
}: {
  plan: Plan;
  asset: SourceAsset;
  bundle: ProjectBundle;
  reload: () => Promise<void>;
  run: <T>(key: string, fn: () => Promise<T>) => Promise<T | undefined>;
  busy: string | null;
}) {
  const duration = asset.probe!.duration;
  const compiled = useMemo(() => compileTimeline(plan.operations, duration, asset.silences ?? []), [plan.operations, duration, asset.silences]);
  const key = timelineKey(compiled.segments);
  const render = plan.renders.find((r) => timelineKey(r.timeline) === key);
  const renderJob = bundle.jobs.find((j) => j.type === "render_preview" && j.payload.renderId === render?.id && !j.payload.full);
  const fullJob = bundle.jobs.find((j) => j.type === "render_preview" && j.payload.renderId === render?.id && j.payload.full);
  const rendering = renderJob && (renderJob.status === "queued" || renderJob.status === "running");
  const [mode, setMode] = useState<Mode>("side");

  const updateOp = (op: EditOperation, patch: Partial<EditOperation>) =>
    run(`op-${op.id}`, async () => {
      await api(`/api/operations/${op.id}`, { method: "PATCH", json: patch });
      await reload();
    });

  const requestRender = (full = false) =>
    run(full ? "full" : "render", async () => {
      await api(`/api/plans/${plan.id}/render`, { json: { full } });
      await reload();
    });

  const original = `/api/media/${asset.id}`;
  const proposed = render?.path ? `/api/media/${asset.id}?render=${render.id}` : null;
  const continuity = plan.summary.split("\n").filter((l) => l.startsWith("• "));
  const summary = plan.summary.split("\n").filter((l) => !l.startsWith("• ")).join(" ");
  const delta = compiled.duration - duration;

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-4">
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{plan.treatment}</h2>
            <ModelTag model={plan.model} />
            <span className="ml-auto text-sm text-muted tabular-nums">
              {formatClock(duration)} → {formatClock(compiled.duration)}{" "}
              <span className={delta < 0 ? "text-add-ink" : ""}>({delta <= 0 ? "−" : "+"}{formatClock(Math.abs(delta))})</span>
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">{summary}</p>
          {continuity.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-sm">
              {continuity.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
          {plan.observations.length > 0 && <Observations plan={plan} />}
        </Card>

        <VerificationPanel plan={plan} bundle={bundle} />

        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              ["side", "Side by side"],
              ["ab", "A/B toggle"],
              ["sequential", "Sequential"],
              ["diff", "Timeline diff"],
            ] as const
          ).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded-md px-2.5 py-1 text-sm ${mode === m ? "bg-card font-medium ring-1 ring-line" : "text-muted hover:text-ink"}`}>
              {label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {!render?.path && !rendering && (
              <Button variant="primary" onClick={() => requestRender()} busy={busy === "render"}>
                Render preview
              </Button>
            )}
            {rendering && (
              <span className="flex items-center gap-2 text-sm text-muted">
                <Spinner /> {renderJob?.stage}…
              </span>
            )}
            {renderJob?.status === "failed" && <span className="text-sm text-del-ink">Render failed: {renderJob.error?.slice(0, 120)}</span>}
          </div>
        </div>

        {mode === "diff" ? (
          <TimelineDiff segments={compiled.segments} duration={duration} outputDuration={compiled.duration} operations={plan.operations} />
        ) : mode === "ab" ? (
          <AbPlayer original={original} proposed={proposed} segments={compiled.segments} />
        ) : mode === "sequential" ? (
          <SequentialPlayer original={original} proposed={proposed} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <Player label="Original cut" src={original} role="original" />
            {proposed ? <Player label="Proposed cut" src={proposed} /> : <PendingPlayer rendering={Boolean(rendering)} />}
          </div>
        )}
        {mode !== "diff" && <TimelineDiff segments={compiled.segments} duration={duration} outputDuration={compiled.duration} operations={plan.operations} compact />}

        {compiled.skipped.filter((s) => plan.operations.find((o) => o.id === s.id)?.executability === "direct").length > 0 && (
          <p className="text-xs text-amber-700">
            Not applied: {compiled.skipped.map((s) => `${plan.operations.find((o) => o.id === s.id)?.title} (${s.reason})`).join("; ")}
          </p>
        )}

        <Card className="flex flex-wrap items-center gap-2 p-3">
          <span className="text-xs text-muted">Export</span>
          {(
            [
              ["md", "Edit instructions"],
              ["json", "Edit plan JSON"],
              ["otio", "OpenTimelineIO"],
              ["edl", "EDL (CMX 3600)"],
            ] as const
          ).map(([f, label]) => (
            <a key={f} href={`/api/plans/${plan.id}/export?format=${f}`} className="rounded-md border border-line px-2.5 py-1 text-sm hover:border-faint">
              {label}
            </a>
          ))}
          {render?.path &&
            (fullJob?.status === "succeeded" ? (
              <a href={`/api/media/${asset.id}?render=${render.id}&full=1`} className="rounded-md bg-ink px-2.5 py-1 text-sm text-white">
                Download full-resolution MP4
              </a>
            ) : fullJob && fullJob.status !== "failed" ? (
              <span className="flex items-center gap-2 text-sm text-muted">
                <Spinner /> {fullJob.stage}…
              </span>
            ) : (
              <Button onClick={() => requestRender(true)} busy={busy === "full"}>
                Render full resolution
              </Button>
            ))}
          <span className="text-xs text-faint">EDL carries cuts only; effects and text stay in the instructions.</span>
        </Card>

        {asset.transcript && <TranscriptPanel asset={asset} segments={compiled.segments} />}
      </div>

      <aside className="space-y-2">
        <h3 className="text-xs font-medium tracking-wide text-muted uppercase">Edit decisions</h3>
        {plan.operations.map((op) => (
          <OperationCard key={op.id} op={op} duration={duration} onChange={(p) => updateOp(op, p)} busy={busy === `op-${op.id}`} applied={compiled.appliedOperationIds.includes(op.id)} />
        ))}
        {!render && !rendering && plan.renders.length > 0 && (
          <div className="pt-2">
            <p className="mb-2 text-xs text-muted">Your edits changed since the last preview.</p>
            <Button variant="primary" className="w-full" onClick={() => requestRender()} busy={busy === "render"}>
              Update preview
            </Button>
          </div>
        )}
      </aside>
    </div>
  );
}

function OperationCard({ op, duration, onChange, busy, applied }: { op: EditOperation; duration: number; onChange: (p: Partial<EditOperation>) => void; busy: boolean; applied: boolean }) {
  const editable = op.executability === "direct";
  const time = (field: "sourceIn" | "sourceOut" | "targetAt", label: string) =>
    op[field] != null && (
      <label className="flex items-center gap-1">
        <span className="text-faint">{label}</span>
        <input
          type="number"
          step={0.1}
          min={0}
          max={duration}
          defaultValue={op[field]!.toFixed(1)}
          disabled={!editable}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v) && Math.abs(v - op[field]!) > 0.01) onChange({ [field]: v });
          }}
          className="w-16 rounded border border-line px-1 py-0.5 tabular-nums disabled:border-transparent disabled:bg-transparent"
        />
        <span className="text-faint">({formatClock(op[field]!)})</span>
      </label>
    );

  return (
    <Card className={`p-3 text-sm ${op.reviewStatus === "rejected" ? "opacity-50" : ""}`}>
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={op.enabled}
          disabled={!editable || busy}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="mt-1 accent-[var(--color-accent)]"
          title={editable ? "Include in proposed cut" : "Needs material that doesn't exist yet"}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-medium">{op.title}</p>
            <Badge kind={op.executability} />
            {busy && <Spinner className="text-muted" />}
          </div>
          <p className="mt-1 text-muted">{op.rationale}</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span className="text-faint">{op.type.replace("_", " ")}</span>
            {time("sourceIn", "in")}
            {time("sourceOut", "out")}
            {op.type === "move" && time("targetAt", "to")}
          </div>
          {op.requiredAssets.length > 0 && <p className="mt-2 text-xs">Needs: {op.requiredAssets.join(", ")}</p>}
          {op.warnings.map((w, i) => (
            <p key={i} className="mt-1 text-xs text-amber-700">
              ⚠ {w}
            </p>
          ))}
          {op.enabled && editable && !applied && <p className="mt-1 text-xs text-amber-700">Not applied (conflicts or invalid range)</p>}
          <div className="mt-2 flex gap-1">
            {op.reviewStatus !== "accepted" && (
              <Button variant="ghost" className="!px-1.5 !py-0.5 text-xs" onClick={() => onChange({ reviewStatus: "accepted" })}>
                Approve
              </Button>
            )}
            {op.reviewStatus !== "rejected" ? (
              <Button variant="ghost" className="!px-1.5 !py-0.5 text-xs" onClick={() => onChange({ reviewStatus: "rejected" })}>
                Reject
              </Button>
            ) : (
              <Button variant="ghost" className="!px-1.5 !py-0.5 text-xs" onClick={() => onChange({ reviewStatus: "proposed", enabled: editable })}>
                Undo reject
              </Button>
            )}
            {op.reviewStatus === "accepted" && <span className="self-center text-xs text-add-ink">Approved</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Player({ label, src, role }: { label: string; src: string; role?: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      <video src={src} data-role={role} controls preload="metadata" className="aspect-video w-full rounded-lg bg-black" />
    </div>
  );
}

function PendingPlayer({ rendering }: { rendering: boolean }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted">Proposed cut</p>
      <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-stone-200 text-sm text-muted">
        {rendering ? (
          <span className="flex items-center gap-2">
            <Spinner /> Rendering from your footage…
          </span>
        ) : (
          "Render a preview to watch the proposed cut"
        )}
      </div>
    </div>
  );
}

/** One player; switching versions keeps the same moment in the footage when it survives the cut. */
function AbPlayer({ original, proposed, segments }: { original: string; proposed: string | null; segments: TimelineSegmentMap[] }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [side, setSide] = useState<"a" | "b">("a");
  const pending = useRef<{ t: number; play: boolean } | null>(null);

  const swap = (next: "a" | "b") => {
    const v = ref.current;
    if (!v || next === side || (next === "b" && !proposed)) return;
    const t = v.currentTime;
    let mapped = next === "b" ? sourceToOutput(segments, t) : outputToSource(segments, t);
    if (mapped == null && next === "b") {
      // The moment was cut: jump to the next footage that survives.
      const after = segments.filter((s) => s.sourceIn >= t).sort((x, y) => x.sourceIn - y.sourceIn)[0];
      mapped = after ? after.outputIn : 0;
    }
    pending.current = { t: mapped ?? 0, play: !v.paused };
    setSide(next);
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        <button onClick={() => swap("a")} className={`rounded-md px-3 py-1 text-sm ${side === "a" ? "bg-ink text-white" : "bg-card ring-1 ring-line"}`}>
          A · Original
        </button>
        <button onClick={() => swap("b")} disabled={!proposed} className={`rounded-md px-3 py-1 text-sm disabled:opacity-40 ${side === "b" ? "bg-ink text-white" : "bg-card ring-1 ring-line"}`}>
          B · Proposed
        </button>
        <span className="ml-2 text-xs text-faint">Switching keeps your place in the footage.</span>
      </div>
      <video
        ref={ref}
        src={side === "a" ? original : (proposed ?? undefined)}
        controls
        preload="metadata"
        onLoadedMetadata={(e) => {
          if (pending.current) {
            e.currentTarget.currentTime = pending.current.t;
            if (pending.current.play) void e.currentTarget.play();
            pending.current = null;
          }
        }}
        className="aspect-video w-full max-w-4xl rounded-lg bg-black"
      />
    </div>
  );
}

function SequentialPlayer({ original, proposed }: { original: string; proposed: string | null }) {
  const [which, setWhich] = useState<"a" | "b">("a");
  return (
    <div>
      <p className="mb-2 text-sm text-muted">{which === "a" ? "Playing the original. The proposed cut follows automatically." : "Now playing the proposed cut."}</p>
      <video
        key={which}
        src={which === "a" ? original : (proposed ?? undefined)}
        controls
        autoPlay={which === "b"}
        onEnded={() => proposed && which === "a" && setWhich("b")}
        className="aspect-video w-full max-w-4xl rounded-lg bg-black"
      />
      <div className="mt-2 flex gap-2">
        <Button variant="ghost" onClick={() => setWhich("a")}>
          Restart with original
        </Button>
        <Button variant="ghost" onClick={() => setWhich("b")} disabled={!proposed}>
          Skip to proposed
        </Button>
      </div>
    </div>
  );
}

function TimelineDiff({
  segments,
  duration,
  outputDuration,
  operations,
  compact,
}: {
  segments: TimelineSegmentMap[];
  duration: number;
  outputDuration: number;
  operations: EditOperation[];
  compact?: boolean;
}) {
  const pct = (t: number, d: number) => `${(t / d) * 100}%`;
  const moved = operations.filter((o) => o.enabled && o.type === "move" && o.sourceIn != null);
  const isMoved = (s: TimelineSegmentMap) => moved.some((m) => s.sourceIn >= m.sourceIn! - 0.01 && s.sourceOut <= m.sourceOut! + 0.01);
  // Color follows the source position so a segment keeps its color in both bars.
  const bySource = [...segments].sort((a, b) => a.sourceIn - b.sourceIn);
  const color = (_i: number, s: TimelineSegmentMap) => SEGMENT_COLORS[bySource.indexOf(s) % SEGMENT_COLORS.length];
  const fill = (i: number, s: TimelineSegmentMap) => ({ backgroundColor: color(i, s), backgroundImage: isMoved(s) ? MOVED_TEXTURE : undefined });
  // Width of both bars is proportional to the longer version so length changes are visible.
  const scale = Math.max(duration, outputDuration);

  return (
    <Card className={compact ? "p-3" : "p-4"}>
      <div className="space-y-2">
        <div>
          <p className="mb-1 text-[11px] text-muted">Original · {formatClock(duration)}</p>
          <div className="relative h-5 rounded bg-del" style={{ width: pct(duration, scale) }} title="Red: removed">
            {segments.map((s, i) => (
              <div key={i} className="absolute top-0 h-full rounded-sm border-r-2 border-card" style={{ left: pct(s.sourceIn, duration), width: pct(s.sourceOut - s.sourceIn, duration), ...fill(i, s) }} title={`${formatClock(s.sourceIn)}–${formatClock(s.sourceOut)}`} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[11px] text-muted">Proposed · {formatClock(outputDuration)}</p>
          <div className="relative h-5 rounded bg-stone-100" style={{ width: pct(outputDuration, scale) }}>
            {segments.map((s, i) => (
              <div
                key={i}
                className="absolute top-0 h-full rounded-sm border-r-2 border-card"
                style={{ left: pct(s.outputIn, outputDuration), width: pct(s.outputOut - s.outputIn, outputDuration), ...fill(i, s) }}
                title={`From ${formatClock(s.sourceIn)}–${formatClock(s.sourceOut)}`}
              />
            ))}
          </div>
        </div>
      </div>
      {!compact && (
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 font-normal">#</th>
              <th className="font-normal">Source</th>
              <th className="font-normal">Plays at</th>
              <th className="font-normal">Length</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {segments.map((s, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1">
                  <span className="mr-1.5 inline-block size-2 rounded-sm" style={fill(i, s)} />
                  {i + 1}
                  {isMoved(s) && <span className="ml-1 text-xs text-muted">moved</span>}
                </td>
                <td>
                  {formatClock(s.sourceIn)}–{formatClock(s.sourceOut)}
                </td>
                <td>{formatClock(s.outputIn)}</td>
                <td>{formatClock(s.sourceOut - s.sourceIn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-[11px] text-faint">Each color is the same footage in both versions · pink background is removed · hatched is moved</p>
    </Card>
  );
}

function TranscriptPanel({ asset, segments }: { asset: SourceAsset; segments: TimelineSegmentMap[] }) {
  const [open, setOpen] = useState(false);
  const kept = (t: number) => segments.some((s) => t >= s.sourceIn - 0.05 && t < s.sourceOut);
  return (
    <Card className="p-4">
      <button onClick={() => setOpen((o) => !o)} className="text-sm font-medium">
        {open ? "▾" : "▸"} Transcript ({asset.transcript!.engine})
      </button>
      {open && (
        <div className="mt-3 max-h-96 space-y-1 overflow-y-auto text-sm">
          {asset.transcript!.segments.map((s, i) => (
            <p key={i} className={kept((s.start + s.end) / 2) ? "" : "text-del-ink line-through decoration-del-ink/30"}>
              <span className="mr-2 font-mono text-xs text-faint">{formatClock(s.start)}</span>
              {s.text}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

function seekOriginal(t: number) {
  const v = document.querySelector<HTMLVideoElement>('video[data-role="original"]');
  if (v) {
    v.currentTime = t;
    v.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

/** What Argon saw in the footage, with timestamps that jump the original player. */
function Observations({ plan }: { plan: Plan }) {
  const [showThoughts, setShowThoughts] = useState(false);
  const trace = plan.trace;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium text-muted">What Gemini 4 Argon saw in your footage</p>
        {trace && trace.videoLoads > 0 && (
          <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent">navigated the video {trace.videoLoads}×</span>
        )}
        {trace && trace.thoughts.length > 0 && (
          <button onClick={() => setShowThoughts((s) => !s)} className="text-[11px] text-faint hover:text-ink">
            {showThoughts ? "hide reasoning" : "show reasoning"}
          </button>
        )}
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {plan.observations.map((o, i) => (
          <li key={i} className="flex gap-2">
            <button onClick={() => seekOriginal(o.atSeconds)} className="shrink-0 font-mono text-xs text-accent hover:underline">
              {formatClock(o.atSeconds)}
            </button>
            <span>{o.note}</span>
          </li>
        ))}
      </ul>
      {showThoughts && trace && (
        <ol className="mt-2 space-y-1 rounded-md bg-paper p-2 text-xs text-muted">
          {trace.thoughts.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Rounds of Argon watching its own render, with the cut points it adjusted. */
function VerificationPanel({ plan, bundle }: { plan: Plan; bundle: ProjectBundle }) {
  const job = bundle.jobs.find((j) => j.type === "verify_render" && (j.status === "queued" || j.status === "running") && plan.renders.some((r) => r.id === j.payload.renderId));
  const rerender = bundle.jobs.find((j) => j.type === "render_preview" && (j.status === "queued" || j.status === "running") && Number(j.payload.verifyRound ?? 1) > 1 && plan.renders.some((r) => r.id === j.payload.renderId));
  const rounds = plan.verifications;
  if (!rounds.length && !job) return null;
  const latest = rounds.at(-1);
  const passedCount = latest ? latest.checks.filter((c) => c.passed).length : 0;
  const opTitle = (id: string) => plan.operations.find((o) => o.id === id)?.title ?? "operation";

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Self-check</h3>
        {latest && (
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${latest.passed ? "bg-add text-add-ink" : "bg-amber-50 text-amber-800"}`}>
            {latest.passed ? `Verified by Gemini 4 Argon · ${passedCount}/${latest.checks.length}` : `${passedCount}/${latest.checks.length} checks passed`}
          </span>
        )}
        {(job || rerender) && (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <Spinner /> {job ? job.stage : `Re-rendering with Argon's fixes (round ${rerender!.payload.verifyRound})`}…
          </span>
        )}
        <span className="ml-auto text-xs text-faint">Argon watches its own render next to your original and fixes cut points until every check passes.</span>
      </div>
      <ol className="mt-3 space-y-3">
        {rounds.map((v, i) => (
          <li key={v.id} className="rounded-md border border-line p-3 text-sm">
            <p className="mb-1.5 text-xs font-medium text-muted">
              {v.round === 1 && i > 0 ? "After your edit · " : ""}Check {i + 1} · {v.passed ? "all checks passed" : `${v.checks.filter((c) => !c.passed).length} to fix`}
              {!v.passed && !v.adjustments.length && v.round >= 3 && " · needs your call"}
            </p>
            <ul className="space-y-1">
              {v.checks.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span className={c.passed ? "text-add-ink" : "text-del-ink"}>{c.passed ? "✓" : "✗"}</span>
                  <span>
                    <span className="font-medium">{c.name}</span>
                    {c.atSeconds != null && <span className="ml-1 font-mono text-xs text-faint">@{formatClock(c.atSeconds)}</span>}
                    <span className="block text-xs text-muted">{c.evidence}</span>
                  </span>
                </li>
              ))}
            </ul>
            {v.adjustments.length > 0 && (
              <div className="mt-2 rounded bg-paper p-2 text-xs">
                <p className="font-medium">Argon adjusted:</p>
                {v.adjustments.map((a, i) => (
                  <p key={i} className="text-muted">
                    {opTitle(a.operationId)} · {({ sourceIn: "in", sourceOut: "out", targetAt: "position" } as const)[a.field]} {a.from != null ? formatClock(a.from) : "–"} → {formatClock(a.to)} — {a.reason}
                  </p>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
