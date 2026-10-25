"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { RetentionPoint, VideoMetrics } from "@/lib/db/schema";
import { formatClock } from "@/lib/edit/export";
import { Button, Card, ErrorNote, Spinner } from "./ui";

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
  result: { channelSummary?: string; lessons?: number; videos?: number; synced?: number } | null;
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
        <Card className="p-4">
          <p className="text-[11px] font-medium tracking-wide text-accent uppercase">What Gemini 4 Argon learned from {memory.result.videos} videos</p>
          <p className="mt-1">{memory.result.channelSummary}</p>
          <Link href="/memory" className="mt-2 inline-block text-sm underline">
            {memory.result.lessons} lessons in Channel Memory →
          </Link>
        </Card>
      )}

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
