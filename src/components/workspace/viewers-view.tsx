"use client";

import { useEffect, useMemo, useState } from "react";
import type { RetentionAnalysis } from "@/lib/analytics/retention";
import { api } from "@/lib/client";
import type { ViewerRead } from "@/lib/director/schemas";
import { formatClock } from "@/lib/edit/export";
import type { Finding, RetentionCurve } from "@/lib/projects/service";
import { Badge, Button, Card, ErrorNote, ModelTag } from "../ui";
import { RetentionChart } from "./retention-chart";
import type { WorkspaceProps } from "./workspace";

type ProposedLesson = ViewerRead["proposedLessons"][number];

export function ViewersView({ bundle, reload, go }: WorkspaceProps) {
  const pid = bundle.project.id;
  const asset = bundle.assets.find((a) => a.probe);
  const [curveId, setCurveId] = useState<string | null>(bundle.curves[0]?.id ?? null);
  const curve = bundle.curves.find((c) => c.id === curveId) ?? null;
  const [analysis, setAnalysis] = useState<RetentionAnalysis | null>(null);
  const [proposed, setProposed] = useState<{ lessons: ProposedLesson[]; model: string } | null>(null);
  const [importing, setImporting] = useState(bundle.curves.length === 0);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!curveId) return;
    let live = true;
    api<{ analysis: RetentionAnalysis }>(`/api/projects/${pid}/retention?curve=${curveId}`)
      .then((r) => live && setAnalysis(r.analysis))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [pid, curveId]);

  const findings = bundle.findings.filter((f) => f.curveId === curveId);
  const groups = useMemo(() => groupFindings(findings), [findings]);

  return (
    <div className="grid max-w-6xl gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {bundle.curves.map((c) => (
          <button key={c.id} onClick={() => (setCurveId(c.id), setImporting(false))} className={`rounded-md px-2 py-1 text-sm ${c.id === curveId && !importing ? "bg-card ring-1 ring-line" : "text-muted hover:text-ink"}`}>
            {c.label}
          </button>
        ))}
        <Button variant={importing ? "primary" : "secondary"} className="ml-auto" onClick={() => setImporting((v) => !v)}>
          {importing ? "Cancel" : "Import retention data"}
        </Button>
      </div>

      <ErrorNote error={error} />

      {importing && (
        <ImportForm
          defaultLabel={bundle.project.title}
          defaultDuration={asset?.probe?.duration}
          onDone={async (res) => {
            await reload();
            setCurveId(res.curveId);
            setAnalysis(res.analysis);
            setProposed({ lessons: res.read.proposedLessons, model: res.model });
            setImporting(false);
          }}
          pid={pid}
        />
      )}

      {!importing && curve && analysis && (
        <>
          {groups.length === 0 ? (
            <Card className="p-5 text-sm">
              <p className="font-medium">No unusual moments</p>
              <p className="mt-1 text-muted">
                Retention follows the expected curve within the noise of the data.
                {analysis.openingRetention != null && ` About ${Math.round(analysis.openingRetention * 100)}% watch ratio at the 30-second mark.`}
              </p>
            </Card>
          ) : (
            <section className="space-y-3">
              <h2 className="font-semibold">What viewers did</h2>
              {groups.map((g, i) => (
                <FindingCard
                  key={i}
                  index={i}
                  group={g}
                  open={selected === i}
                  onToggle={() => setSelected(selected === i ? null : i)}
                  curve={curve}
                  analysis={analysis}
                  transcript={asset?.transcript ?? null}
                  go={go}
                  frameAt={
                    bundle.project.youtubeVideoId
                      ? (t) => `/api/frames/${bundle.project.youtubeVideoId}?t=${t.toFixed(1)}`
                      : asset
                        ? (t) => `/api/frames/${asset.id}?t=${t.toFixed(1)}`
                        : undefined
                  }
                />
              ))}
            </section>
          )}

          <details className="rounded-lg border border-line bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">Retention curve and data limits</summary>
            <div className="mt-3">
              <RetentionChart analysis={analysis} durationSeconds={curve.durationSeconds} highlight={selected} />
              <ul className="mt-3 space-y-1 text-xs text-muted">
                <li>Resolution: one point every ~{analysis.resolutionSeconds}s. Baseline: {analysis.baselineSource === "comparable_median" ? "median of comparable videos" : "fitted decay for this video"}.</li>
                {analysis.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          </details>

          {proposed && proposed.lessons.length > 0 && <ProposedLessons lessons={proposed.lessons} model={proposed.model} curve={curve} />}
        </>
      )}
    </div>
  );
}

interface Group {
  start: number;
  end: number;
  observed?: Finding;
  hypothesis?: Finding;
  historical?: Finding;
}

function groupFindings(findings: Finding[]): Group[] {
  const map = new Map<string, Group>();
  for (const f of findings) {
    const key = `${f.startSeconds}-${f.endSeconds}`;
    const g = map.get(key) ?? { start: f.startSeconds ?? 0, end: f.endSeconds ?? 0 };
    if (f.label === "observed") g.observed = f;
    if (f.label === "hypothesis") g.hypothesis = f;
    if (f.label === "historically_associated") g.historical = f;
    map.set(key, g);
  }
  return [...map.values()];
}

function FindingCard({
  index,
  group,
  open,
  onToggle,
  curve,
  analysis,
  transcript,
  go,
  frameAt,
}: {
  frameAt?: (t: number) => string;
  index: number;
  group: Group;
  open: boolean;
  onToggle: () => void;
  curve: RetentionCurve;
  analysis: RetentionAnalysis;
  transcript: { segments: { start: number; end: number; text: string }[] } | null;
  go: WorkspaceProps["go"];
}) {
  const hyp = group.hypothesis ? (JSON.parse(group.hypothesis.body || "{}") as { hypotheses?: string[]; nextAction?: string }) : {};
  // Prefer the anomaly stored with the finding; the live analysis can shift as the channel's baseline grows.
  const anomaly =
    (group.observed?.evidence.anomaly as RetentionAnalysis["anomalies"][number] | undefined) ??
    analysis.anomalies.find((a) => Math.abs(a.startSeconds - group.start) < 0.5);
  const context = anomaly && transcript ? transcript.segments.filter((s) => s.end >= anomaly.contextStartSeconds && s.start <= anomaly.contextEndSeconds) : [];
  const decline = anomaly?.direction === "steeper_decline";

  return (
    <Card className="p-4">
      <div className="flex items-start gap-4">
        {frameAt ? (
          <div className="w-56 shrink-0">
            <div className="relative overflow-hidden rounded-md bg-stone-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={frameAt(group.start)} alt="" className="aspect-video w-full object-cover" />
              <span className="absolute top-1 left-1 flex size-5 items-center justify-center rounded bg-black/75 text-[11px] font-medium text-white">{index + 1}</span>
              <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[11px] text-white">{formatClock(group.start)}</span>
            </div>
            <p className={`mt-1.5 text-[11px] font-medium ${decline ? "text-del-ink" : "text-add-ink"}`}>
              {decline ? "Viewers left faster than usual" : "Viewers held better than usual"}
            </p>
          </div>
        ) : (
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-stone-200 text-[11px] font-medium">{index + 1}</span>
        )}
        <div className="min-w-0 flex-1 space-y-2.5 text-sm">
          <p className="text-xs text-muted tabular-nums">
            {formatClock(group.start)}–{formatClock(group.end)}
          </p>
          {group.observed && (
            <p className={open ? "" : "line-clamp-3"}>
              <Badge kind="observed" /> <span className="ml-1">{withLessonLinks(group.observed.title)}</span>
              {group.observed.evidence.watchedVideo === true && (
                <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent">Gemini 4 Argon watched this moment</span>
              )}
            </p>
          )}
          {open && hyp.hypotheses && (
            <div>
              <Badge kind="hypothesis" />
              <ul className="mt-1 ml-1 space-y-0.5">
                {hyp.hypotheses.map((h, i) => (
                  <li key={i} className="text-muted">
                    {i === 0 ? <span className="text-ink">{h}</span> : `or: ${h}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {open && group.historical && (
            <p>
              <Badge kind="historically_associated" /> <span className="ml-1">{withLessonLinks(group.historical.title)}</span>
            </p>
          )}
          {hyp.nextAction && <p className="font-medium">→ {hyp.nextAction}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            {decline && (
              <Button variant="primary" onClick={() => go("cut")}>
                Preview a recut
              </Button>
            )}
            <Button onClick={() => go("script")}>Apply to a script</Button>
            <Button variant="ghost" onClick={onToggle}>
              {open ? "Show less" : "Why? · evidence"}
            </Button>
          </div>
          {open && anomaly && (
            <div className="mt-2 space-y-3 rounded-md bg-paper p-3">
              <RetentionChart analysis={{ ...analysis, anomalies: [anomaly] }} durationSeconds={curve.durationSeconds} highlight={0} />
              <p className="text-xs text-muted">
                Deviation from expected: {(anomaly.residual * 100).toFixed(1)} points · flagged by {anomaly.detectors.join(", ")} (these share one data source, so agreement is not independent confirmation).
              </p>
              {context.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted">
                    What was on screen {formatClock(anomaly.contextStartSeconds)}–{formatClock(anomaly.contextEndSeconds)} (the cause can come before the drop)
                  </p>
                  {context.map((s, i) => (
                    <p key={i} className={`text-sm ${s.start >= anomaly.startSeconds && s.start <= anomaly.endSeconds ? "" : "text-muted"}`}>
                      <span className="mr-2 font-mono text-xs text-faint">{formatClock(s.start)}</span>
                      {s.text}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted">Upload this video&apos;s source in See the better cut to line the transcript up with this moment.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function ImportForm({
  pid,
  defaultLabel,
  defaultDuration,
  onDone,
}: {
  pid: string;
  defaultLabel: string;
  defaultDuration?: number;
  onDone: (res: { curveId: string; analysis: RetentionAnalysis; read: ViewerRead; model: string }) => Promise<void>;
}) {
  const [label, setLabel] = useState(defaultLabel);
  const [duration, setDuration] = useState(defaultDuration ? formatClock(defaultDuration) : "");
  const [format, setFormat] = useState("long-form");
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seconds = duration.includes(":") ? duration.split(":").reduce((a, p) => a * 60 + Number(p), 0) : Number(duration);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDone(await api(`/api/projects/${pid}/retention`, { json: { csv, label, durationSeconds: seconds, format } }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3 p-5">
      <div>
        <p className="font-medium">Import audience retention</p>
        <p className="mt-1 text-sm text-muted">
          Paste a CSV with position and retention columns — the YouTube Analytics API&apos;s <code className="text-xs">elapsedVideoTimeRatio, audienceWatchRatio</code>, or a YouTube Studio
          export. Direct channel connection is not built yet.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="text-xs text-muted">Video</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 w-full rounded-md border border-line px-2 py-1.5 outline-none" />
        </label>
        <label className="text-sm">
          <span className="text-xs text-muted">Duration (mm:ss)</span>
          <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="12:30" className="mt-1 w-full rounded-md border border-line px-2 py-1.5 outline-none" />
        </label>
        <label className="text-sm">
          <span className="text-xs text-muted">Format</span>
          <select value={format} onChange={(e) => setFormat(e.target.value)} className="mt-1 w-full rounded-md border border-line bg-card px-2 py-1.5">
            <option value="long-form">Long-form</option>
            <option value="short">Short</option>
            <option value="livestream">Livestream</option>
          </select>
        </label>
      </div>
      <textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        rows={6}
        placeholder={"elapsedVideoTimeRatio,audienceWatchRatio\n0.01,1.0\n0.02,0.86\n…"}
        className="block w-full rounded-md border border-line p-2 font-mono text-xs outline-none"
      />
      <div className="flex items-center gap-2">
        <label className="cursor-pointer text-sm text-muted hover:text-ink">
          or choose a CSV file
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => e.target.files?.[0] && setCsv(await e.target.files[0].text())} />
        </label>
        <Button variant="primary" className="ml-auto" onClick={submit} busy={busy} disabled={!csv.trim() || !(seconds > 0) || !label.trim()}>
          Analyze
        </Button>
      </div>
      <ErrorNote error={error} />
    </Card>
  );
}

function ProposedLessons({ lessons, model, curve }: { lessons: ProposedLesson[]; model: string; curve: RetentionCurve }) {
  const [items, setItems] = useState(lessons.map((l) => ({ ...l, state: "new" as "new" | "saved" | "dismissed" })));
  const save = async (i: number) => {
    const l = items[i];
    await api("/api/lessons", {
      json: {
        claim: l.claim,
        applicability: l.applicability,
        suggestedUse: l.suggestedUse,
        status: "hypothesis",
        strength: "weak",
        scope: { formats: [curve.format] },
        evidence: [{ label: `Retention of “${curve.label}”`, videoLabel: curve.label }],
      },
    });
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, state: "saved" } : x)));
  };
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-semibold">Lessons worth keeping</h2>
        <ModelTag model={model} />
      </div>
      <div className="space-y-2">
        {items.map((l, i) =>
          l.state === "dismissed" ? null : (
            <Card key={i} className="p-3 text-sm">
              <textarea
                value={l.claim}
                onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, claim: e.target.value } : x)))}
                rows={2}
                disabled={l.state === "saved"}
                className="block w-full resize-none bg-transparent outline-none"
              />
              <p className="text-xs text-muted">Applies when: {l.applicability}</p>
              <div className="mt-2 flex gap-2">
                {l.state === "saved" ? (
                  <span className="text-xs text-add-ink">Saved to Channel Memory as a hypothesis</span>
                ) : (
                  <>
                    <Button onClick={() => save(i)}>Save to Channel Memory</Button>
                    <Button variant="ghost" onClick={() => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, state: "dismissed" } : x)))}>
                      Dismiss
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ),
        )}
      </div>
    </section>
  );
}

/** Turns "[les_abc123]" references into links to the lesson in Channel Memory. */
function withLessonLinks(text: string) {
  // Model text sometimes quotes internal statistics; creators don't need them.
  text = text.replace(/\s*\((?:residual|residual_vs_expected)[^)]*\)/gi, "").replace(/\s*residual[^,.;)]*/gi, "");
  const parts = text.split(/\[(les_[a-z0-9]+)\]/g);
  return parts.map((part, i) =>
    i % 2 ? (
      <a key={i} href={`/memory#${part}`} className="rounded bg-amber-50 px-1 text-[12px] text-amber-800 hover:underline">
        channel lesson
      </a>
    ) : (
      part
    ),
  );
}
