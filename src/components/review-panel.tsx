"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { formatClock } from "@/lib/edit/export";
import { Button, Card, ErrorNote, Spinner } from "./ui";

interface Persona {
  id: string;
  name: string;
  role: string;
}

interface ReviewRow {
  id: string;
  persona: string;
  status: "running" | "done" | "failed";
  error: string | null;
  result: {
    verdict?: "ship" | "revise";
    score?: number;
    headline?: string;
    wouldStopAtSeconds?: number | null;
    notes?: { atSeconds?: number | null; note: string; severity: "high" | "medium" | "low" }[];
    topFix?: string;
    summary?: string;
    fixes?: { fix: string; raisedBy: string[]; atSeconds: number | null }[];
  } | null;
}

interface PanelState {
  personas: Persona[];
  reviews: ReviewRow[];
  job: { status: string; stage: string; error: string | null } | null;
}

const AVATAR = ["bg-sky-600", "bg-orange-600", "bg-emerald-700", "bg-violet-600"];

/**
 * Four Managed Agents (Antigravity on Gemini 4 Argon), each with its own
 * perspective, review a rendered cut or a script; Argon merges their notes.
 */
export function ReviewPanel({
  targetType,
  targetId,
  projectId,
  frameUrl,
}: {
  targetType: "render" | "script" | "video";
  targetId: string;
  projectId: string;
  /** For renders: URL of a still at a cut-time timestamp. */
  frameUrl?: (t: number) => string;
}) {
  const [state, setState] = useState<PanelState | null>(null);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState(false);

  useEffect(() => {
    let live = true;
    api<PanelState>(`/api/reviews?target=${targetId}`).then((s) => live && setState(s));
    return () => {
      live = false;
    };
  }, [targetId, tick]);

  const running = state?.job && (state.job.status === "queued" || state.job.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((x) => x + 1), 3000);
    return () => clearInterval(t);
  }, [running]);

  const convene = async () => {
    setError(null);
    try {
      await api("/api/reviews", { json: { targetType, targetId, projectId } });
      setTick((x) => x + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!state) return null;
  const byPersona = new Map(state.reviews.map((r) => [r.persona, r]));
  const consensus = byPersona.get("consensus");
  const hasAny = state.personas.some((p) => byPersona.has(p.id));

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Review panel</h3>
        <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent">4 Managed Agents · Gemini 4 Argon</span>
        {running && (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <Spinner /> {state.job!.stage}…
          </span>
        )}
        <Button className="ml-auto" onClick={convene} disabled={Boolean(running)}>
          {hasAny ? "Review again" : targetType === "render" ? "Convene the panel on this cut" : targetType === "video" ? "Have the panel review this video" : "Convene the panel on this script"}
        </Button>
      </div>
      <p className="mt-1 text-xs text-faint">Four reviewers with different perspectives, each a Managed Agent in its own sandbox.</p>
      <ErrorNote error={error ?? (state.job?.status === "failed" ? state.job.error : null)} />

      {consensus?.result?.summary && (
        <div className="mt-4 rounded-lg bg-paper p-3">
          <p className="text-[11px] font-medium tracking-wide text-accent uppercase">The panel&apos;s top fixes · merged by Gemini 4 Argon</p>
          <ol className="mt-2 space-y-1 text-sm">
            {consensus.result.fixes?.slice(0, 3).map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-medium text-accent">{i + 1}.</span>
                <span>
                  {f.fix}
                  {f.atSeconds != null && <span className="ml-1 font-mono text-xs text-faint">@{formatClock(f.atSeconds)}</span>}
                  <span className="ml-1.5 text-xs text-muted">· {f.raisedBy.join(", ")}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {(hasAny || running) && (
        <>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {state.personas.map((p, i) => {
            const r = byPersona.get(p.id);
            const res = r?.result;
            return (
              <div key={p.id} className="rounded-lg border border-line p-3 text-sm">
                <div className="flex items-center gap-2.5">
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${AVATAR[i % AVATAR.length]}`}>{p.name[0]}</span>
                  <div className="min-w-0">
                    <p className="font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted">{p.role}</p>
                  </div>
                  {res?.verdict && (
                    <span className={`ml-auto rounded px-1.5 py-0.5 text-[11px] font-medium ${res.verdict === "ship" ? "bg-add text-add-ink" : "bg-amber-50 text-amber-800"}`}>
                      {res.verdict === "ship" ? "Ship it" : "Revise"} · {res.score}/10
                    </span>
                  )}
                  {(!r || r.status === "running") && running && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-muted">
                      <Spinner /> reviewing
                    </span>
                  )}
                </div>
                {r?.status === "failed" && <p className="mt-2 text-xs text-del-ink">{r.error}</p>}
                {res?.headline && <p className={`mt-2 italic ${details ? "" : "line-clamp-2"}`}>“{res.headline}”</p>}
                {details && res?.wouldStopAtSeconds != null && targetType === "render" && (
                  <p className="mt-1 text-xs text-muted">Would stop watching at {formatClock(res.wouldStopAtSeconds)}</p>
                )}
                {details && res?.notes && (
                  <ul className="mt-2 space-y-2">
                    {res.notes.map((n, k) => (
                      <li key={k} className="flex gap-2">
                        {n.atSeconds != null && frameUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={frameUrl(n.atSeconds)} alt="" className="h-12 w-20 shrink-0 rounded object-cover" />
                        ) : (
                          <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${n.severity === "high" ? "bg-del-ink" : n.severity === "medium" ? "bg-amber-500" : "bg-faint"}`} />
                        )}
                        <span>
                          {n.atSeconds != null && <span className="mr-1 font-mono text-xs text-accent">{formatClock(n.atSeconds)}</span>}
                          {n.note}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {details && res?.topFix && (
                  <p className="mt-2 border-t border-line pt-2 text-xs">
                    <span className="font-medium">Top fix:</span> {res.topFix}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {hasAny && (
          <button onClick={() => setDetails((d) => !d)} className="mt-3 text-xs font-medium text-accent hover:underline">
            {details ? "Hide full reviews" : "Read the full reviews"}
          </button>
        )}
        </>
      )}
    </Card>
  );
}
