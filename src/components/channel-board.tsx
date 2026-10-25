"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { RetentionPoint, VideoMetrics } from "@/lib/db/schema";
import { formatClock } from "@/lib/edit/export";
import { Badge, Button, Card, ErrorNote, Spinner } from "./ui";

interface Video {
  id: string;
  title: string;
  durationSeconds: number;
  metrics: VideoMetrics;
  points: RetentionPoint[];
  card: { hook?: string; firstPayoffSeconds?: number | null } | null;
  projectId: string | null;
}

interface Job {
  id: string;
  type: string;
  status: string;
  stage: string;
  error: string | null;
  result: {
    channelSummary?: string;
    lessons?: number;
    videos?: number;
    synced?: number;
    advice?: { title: string; why: string; action: string; evidence: Moment[] }[];
  } | null;
}

interface Moment {
  videoId: string;
  title?: string;
  atSeconds: number | null;
  note: string;
}

interface Lesson {
  id: string;
  claim: string;
  status: string;
  strength: string;
  origin: string;
  archived: boolean;
  applicability: string;
  evidence: { label: string; videoLabel?: string; startSeconds?: number }[];
  counterexamples: { label: string; videoLabel?: string; startSeconds?: number }[];
}

export function ChannelBoard() {
  const router = useRouter();
  const [data, setData] = useState<{ channelId: string | null; videos: Video[]; jobs: Job[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tick, setTick] = useState(0);
  const load = useCallback(async () => setTick((t) => t + 1), []);
  useEffect(() => {
    let live = true;
    api<NonNullable<typeof data>>("/api/youtube").then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [tick]);
  const running = data?.jobs.find((j) => j.status === "queued" || j.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((x) => x + 1), 2000);
    return () => clearInterval(t);
  }, [running]);

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <Spinner className="text-muted" />;
  if (!data.channelId) {
    return (
      <Card className="p-5 text-sm text-muted">
        YouTube Analytics is not connected. Put a read-only OAuth client and token in <code>~/.config/youtube-analytics-readonly</code> (see Settings), then reload.
      </Card>
    );
  }

  const memory = data.jobs.find((j) => j.type === "synthesize_memory" && j.status === "succeeded");
  const idForTitle = (title?: string) => data.videos.find((v) => v.title === title)?.id;
  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div>
          <p className="font-medium">Connected · read-only YouTube Analytics</p>
          <p className="font-mono text-xs text-faint">{data.channelId}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {running && (
            <span className="flex items-center gap-2 text-sm text-muted">
              <Spinner /> {running.stage}…
            </span>
          )}
          <Button
            variant="primary"
            busy={busy === "sync"}
            disabled={Boolean(running)}
            onClick={() => act("sync", async () => (await api("/api/youtube", { json: { action: "sync", limit: 8 } }), await load()))}
          >
            {data.videos.length ? "Sync latest videos" : "Sync channel"}
          </Button>
        </div>
      </Card>
      <ErrorNote error={error ?? data.jobs.find((j) => j.status === "failed")?.error ?? null} />

      {memory?.result?.channelSummary && (
        <Card className="p-5">
          <p className="text-[11px] font-medium tracking-wide text-accent uppercase">What Gemini 4 Argon learned by watching {memory.result.videos} of your videos</p>
          <p className="mt-1.5 text-[15px] leading-relaxed">{memory.result.channelSummary}</p>
        </Card>
      )}

      {memory?.result?.advice && memory.result.advice.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Overall advice for your next video</h2>
          <ol className="space-y-3">
            {memory.result.advice.map((a, i) => (
              <li key={i}>
                <Card className="p-4">
                  <div className="flex gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{a.title}</p>
                      <p className="mt-1 text-sm text-muted">{a.why}</p>
                      <p className="mt-1.5 text-sm">
                        <span className="font-medium">Do this: </span>
                        {a.action}
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        {a.evidence.map((e, k) => (
                          <MomentCard key={k} moment={e} />
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        </section>
      )}

      <LessonsSection idForTitle={idForTitle} />

      <ul className="grid gap-3 md:grid-cols-2">
        {data.videos.map((v) => (
          <li key={v.id}>
            <Card className="flex h-full gap-3 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" className="h-20 w-36 shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium">{v.title}</p>
                <p className="mt-0.5 text-xs text-muted tabular-nums">
                  {formatClock(v.durationSeconds)} · {v.metrics.views?.toLocaleString() ?? "–"} views · {v.metrics.averageViewPercentage?.toFixed(0) ?? "–"}% avg viewed
                </p>
                <Sparkline points={v.points} />
                {v.card?.hook && <p className="mt-1 line-clamp-2 text-xs text-muted">Hook: {v.card.hook}</p>}
                <div className="mt-2">
                  {v.projectId ? (
                    <Link href={`/projects/${v.projectId}?view=viewers`} className="text-xs underline">
                      Open analysis
                    </Link>
                  ) : (
                    <Button
                      className="!px-2 !py-1 text-xs"
                      busy={busy === v.id}
                      disabled={!!busy}
                      onClick={() =>
                        act(v.id, async () => {
                          const r = await api<{ redirect: string }>(`/api/youtube/videos/${v.id}/analyze`, { json: {} });
                          router.push(r.redirect);
                        })
                      }
                    >
                      {busy === v.id ? "Argon is watching…" : "Analyze with Argon"}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Retention curve thumbnail: watch ratio over the video's length. */
function Sparkline({ points }: { points: RetentionPoint[] }) {
  if (points.length < 2) return null;
  const max = Math.max(1, ...points.map((p) => p.watchRatio));
  const d = points.map((p, i) => `${i ? "L" : "M"}${(p.ratio * 200).toFixed(1)},${(28 - (p.watchRatio / max) * 26).toFixed(1)}`).join("");
  return (
    <svg viewBox="0 0 200 30" className="mt-1.5 h-6 w-full" preserveAspectRatio="none" aria-label="Audience retention">
      <path d={d} fill="none" stroke="#2a78d6" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A real frame from the published video at the moment, with its timestamp and what happened. */
function MomentCard({ moment }: { moment: Moment }) {
  const t = moment.atSeconds ?? 0;
  return (
    <a href={`https://www.youtube.com/watch?v=${moment.videoId}&t=${Math.floor(t)}s`} target="_blank" rel="noreferrer" className="group block">
      <div className="relative overflow-hidden rounded-md bg-stone-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/frames/${moment.videoId}?t=${t.toFixed(1)}`} alt="" className="aspect-video w-full object-cover transition-transform group-hover:scale-[1.03]" />
        {moment.atSeconds != null && (
          <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[11px] text-white">{formatClock(moment.atSeconds)}</span>
        )}
      </div>
      {moment.title && <p className="mt-1.5 line-clamp-1 text-xs font-medium">{moment.title}</p>}
      <p className="mt-0.5 line-clamp-3 text-xs text-muted">{moment.note}</p>
    </a>
  );
}

/** Lessons Argon wrote from the back catalog, each shown with the moments that support or contradict it. */
function LessonsSection({ idForTitle }: { idForTitle: (title?: string) => string | undefined }) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  useEffect(() => {
    api<{ lessons: Lesson[] }>("/api/lessons").then((r) => setLessons(r.lessons.filter((l) => l.origin === "gemini" && !l.archived)));
  }, []);
  if (!lessons.length) return null;
  const moments = (refs: Lesson["evidence"]) =>
    refs.flatMap((e) => {
      const id = idForTitle(e.videoLabel);
      const note = e.label.split(": ").slice(1).join(": ") || e.label;
      return id ? [{ videoId: id, title: e.videoLabel, atSeconds: e.startSeconds ?? null, note }] : [];
    });
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-semibold">Lessons from your back catalog</h2>
        <Link href="/memory" className="ml-auto text-sm underline">
          Edit in Channel Memory →
        </Link>
      </div>
      <div className="space-y-3">
        {lessons.map((l) => (
          <Card key={l.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge kind={l.status} />
              <span className="text-xs text-muted">{l.strength} evidence</span>
            </div>
            <p className="mt-1.5 font-medium">{l.claim}</p>
            {l.applicability && <p className="mt-0.5 text-sm text-muted">Applies when: {l.applicability}</p>}
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              {moments(l.evidence).slice(0, 3).map((m, i) => (
                <MomentCard key={i} moment={m} />
              ))}
              {moments(l.counterexamples).slice(0, 1).map((m, i) => (
                <div key={`c${i}`} className="rounded-md ring-2 ring-amber-300 ring-offset-2">
                  <p className="mb-1 text-[11px] font-medium text-amber-800">Counterexample</p>
                  <MomentCard moment={m} />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
