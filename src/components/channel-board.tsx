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
    ideas?: Idea[];
  } | null;
}

interface Idea {
  title: string;
  hook: string;
  whyNow: string;
  fitsChannel: string;
  method: string;
  sources: { title: string; url: string }[];
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
  const firstSentence = (t: string) => t.match(/^.+?[.!?](\s|$)/)?.[0] ?? t;
  const avgViewed = data.videos.length
    ? Math.round(data.videos.reduce((sum, v) => sum + (v.metrics.averageViewPercentage ?? 0), 0) / data.videos.length)
    : null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="flex items-center gap-1.5 text-muted">
          <span className="size-1.5 rounded-full bg-emerald-500" /> YouTube Analytics connected (read-only)
        </span>
        {running && (
          <span className="flex items-center gap-2 text-muted">
            <Spinner /> {running.stage}…
          </span>
        )}
        <Button
          className="ml-auto"
          busy={busy === "sync"}
          disabled={Boolean(running)}
          onClick={() => act("sync", async () => (await api("/api/youtube", { json: { action: "sync", limit: 8 } }), await load()))}
        >
          {data.videos.length ? "Sync latest videos" : "Sync channel"}
        </Button>
      </div>
      <ErrorNote error={error ?? data.jobs.find((j) => j.status === "failed")?.error ?? null} />

      {memory?.result?.channelSummary && (
        <Card className="p-6">
          <p className="text-[11px] font-medium tracking-wide text-accent uppercase">Gemini 4 Argon watched your last {memory.result.videos} videos</p>
          <p className="mt-2 text-xl leading-snug font-semibold tracking-tight">{firstSentence(memory.result.channelSummary)}</p>
          <div className="mt-4 flex flex-wrap gap-6 text-sm">
            <Stat value={String(memory.result.videos ?? data.videos.length)} label="videos watched" />
            <Stat value={String(memory.result.advice?.length ?? 0)} label="moves for your next video" />
            <Stat value={String(memory.result.lessons ?? 0)} label="lessons learned" />
            {avgViewed != null && <Stat value={`${avgViewed}%`} label="average viewed today" />}
          </div>
        </Card>
      )}

      {memory?.result?.advice && memory.result.advice.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Do this in your next video</h2>
          <ol className="grid gap-4 lg:grid-cols-3">
            {memory.result.advice.map((a, i) => (
              <AdviceCard key={i} index={i} advice={a} />
            ))}
          </ol>
        </section>
      )}

      <IdeasSection
        job={data.jobs.find((j) => j.type === "scout_ideas")}
        onScout={() => act("ideas", async () => (await api("/api/youtube", { json: { action: "ideas" } }), await load()))}
        busy={busy === "ideas"}
      />

      <LessonsSection idForTitle={idForTitle} />

      <details className="group">
        <summary className="cursor-pointer list-none text-sm font-medium text-muted hover:text-ink">
          <span className="group-open:hidden">▸</span>
          <span className="hidden group-open:inline">▾</span> Your videos ({data.videos.length})
        </summary>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.videos.map((v) => (
            <li key={v.id}>
              <Card className="h-full overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" className="aspect-video w-full object-cover" />
                <div className="p-2.5">
                  <p className="line-clamp-2 text-xs font-medium">{v.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted tabular-nums">{v.metrics.averageViewPercentage?.toFixed(0) ?? "–"}% viewed</p>
                  <Sparkline points={v.points} />
                  <div className="mt-1.5">
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
      </details>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

/** One move for the next video: the headline and one real moment up front; reasoning and more moments on demand. */
function AdviceCard({ index, advice }: { index: number; advice: { title: string; why: string; action: string; evidence: Moment[] } }) {
  const [open, setOpen] = useState(false);
  const [lead, ...rest] = advice.evidence;
  return (
    <li>
      <Card className="flex h-full flex-col overflow-hidden">
        {lead && <MomentImage moment={lead} />}
        <div className="flex flex-1 flex-col p-4">
          <div className="flex gap-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">{index + 1}</span>
            <p className="leading-snug font-semibold">{advice.title}</p>
          </div>
          {open && (
            <div className="mt-3 space-y-2 text-sm">
              <p className="text-muted">{advice.why}</p>
              <p>
                <span className="font-medium">Do this: </span>
                {advice.action}
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {[lead, ...rest].filter(Boolean).map((e, k) => (
                  <MomentCard key={k} moment={e} />
                ))}
              </div>
            </div>
          )}
          <button onClick={() => setOpen((o) => !o)} className="mt-auto pt-3 text-left text-xs font-medium text-accent hover:underline">
            {open ? "Show less" : `Why · ${advice.evidence.length} moments from your videos`}
          </button>
        </div>
      </Card>
    </li>
  );
}

function MomentImage({ moment }: { moment: Moment }) {
  const t = moment.atSeconds ?? 0;
  return (
    <a href={`https://www.youtube.com/watch?v=${moment.videoId}&t=${Math.floor(t)}s`} target="_blank" rel="noreferrer" className="relative block bg-stone-200">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/frames/${moment.videoId}?t=${t.toFixed(1)}`} alt="" className="aspect-video w-full object-cover" />
      <span className="absolute bottom-2 left-2 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[11px] text-white">
        {moment.atSeconds != null ? formatClock(moment.atSeconds) : ""} · {moment.title?.slice(0, 32)}
      </span>
    </a>
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
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight">What your channel taught it</h2>
        <Link href="/memory" className="ml-auto text-sm text-muted underline">
          All lessons
        </Link>
      </div>
      <Card className="divide-y divide-line">
        {lessons.map((l) => (
          <LessonRow key={l.id} lesson={l} moments={moments(l.evidence)} counter={moments(l.counterexamples)} />
        ))}
      </Card>
    </section>
  );
}

function LessonRow({ lesson: l, moments, counter }: { lesson: Lesson; moments: Moment[]; counter: Moment[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-4">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 text-left">
        <div className="flex shrink-0 -space-x-3">
          {moments.slice(0, 3).map((m, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={`/api/frames/${m.videoId}?t=${(m.atSeconds ?? 0).toFixed(1)}`} alt="" className="h-10 w-16 rounded border-2 border-card object-cover" />
          ))}
        </div>
        <p className="min-w-0 flex-1 text-sm font-medium">{l.claim}</p>
        <Badge kind={l.status} />
      </button>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {moments.slice(0, 3).map((m, i) => (
            <MomentCard key={i} moment={m} />
          ))}
          {counter.slice(0, 1).map((m, i) => (
            <div key={`c${i}`} className="rounded-md ring-2 ring-amber-300 ring-offset-2">
              <p className="mb-1 text-[11px] font-medium text-amber-800">Counterexample</p>
              <MomentCard moment={m} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Next-video ideas: what's trending (researched by a Managed Agent) matched to what this channel's viewers respond to. */
function IdeasSection({ job, onScout, busy }: { job?: Job; onScout: () => void; busy: boolean }) {
  const router = useRouter();
  const [starting, setStarting] = useState<number | null>(null);
  const running = job && (job.status === "queued" || job.status === "running");
  const ideas = job?.status === "succeeded" ? (job.result?.ideas ?? []) : [];
  const script = async (idea: Idea, i: number) => {
    setStarting(i);
    const r = await api<{ redirect: string }>("/api/start", { json: { text: `${idea.title}. ${idea.hook}`, kind: "idea", title: idea.title } });
    router.push(r.redirect);
  };
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Ideas for your next video</h2>
        <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent">trends researched by a Managed Agent</span>
        <Button className="ml-auto" onClick={onScout} busy={busy} disabled={Boolean(running)}>
          {ideas.length ? "Find new ideas" : "Find trending ideas"}
        </Button>
      </div>
      {running && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> {job!.stage}…
        </p>
      )}
      {ideas.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {ideas.map((idea, i) => (
            <li key={i}>
              <Card className="flex h-full flex-col p-4">
                <p className="leading-snug font-semibold">{idea.title}</p>
                <p className="mt-2 line-clamp-3 text-sm italic">“{idea.hook}”</p>
                <p className="mt-3 line-clamp-2 text-xs">
                  <span className="font-medium text-accent">Why now · </span>
                  <span className="text-muted">{idea.whyNow}</span>
                </p>
                <p className="mt-1 line-clamp-2 text-xs">
                  <span className="font-medium text-accent">Fits your channel · </span>
                  <span className="text-muted">{idea.fitsChannel.replace(/\(?\[?les_[a-z0-9]+\]?\)?/g, "").replace(/\s+([,.;])/g, "$1").replace(/\s{2,}/g, " ")}</span>
                </p>
                {idea.sources.length > 0 && (
                  <p className="mt-2 line-clamp-1 text-[11px] text-faint">
                    {idea.sources.slice(0, 2).map((src, k) => (
                      <a key={k} href={src.url} target="_blank" rel="noreferrer" className="mr-2 underline">
                        {src.title}
                      </a>
                    ))}
                  </p>
                )}
                <div className="mt-auto pt-3">
                  <Button variant="primary" onClick={() => script(idea, i)} busy={starting === i}>
                    Script this idea
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
