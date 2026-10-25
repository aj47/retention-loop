import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { RetentionPoint, VideoMetrics } from "@/lib/db/schema";

const run = promisify(execFile);

// Read-only YouTube Analytics access. The OAuth client and refresh token live
// outside the repo (yt-analytics.readonly scope only); this app never writes
// to YouTube.
function configDir() {
  const dir = process.env.YT_ANALYTICS_CONFIG_DIR ?? path.join(homedir(), ".config", "youtube-analytics-readonly");
  return dir.replace(/^~/, homedir());
}

interface Store {
  channels: Record<string, { refresh_token: string; client_id?: string; scope?: string }>;
}

function readConfig(): { client: { client_id: string; client_secret: string; token_uri?: string }; store: Store } | null {
  try {
    const client = JSON.parse(readFileSync(path.join(configDir(), "client_secret.json"), "utf8")).installed;
    const store = JSON.parse(readFileSync(path.join(configDir(), "token.json"), "utf8")) as Store;
    return client && store?.channels ? { client, store } : null;
  } catch {
    return null;
  }
}

export function connectedChannelId(): string | null {
  const cfg = readConfig();
  if (!cfg) return null;
  const ids = Object.keys(cfg.store.channels);
  return process.env.YT_CHANNEL_ID && ids.includes(process.env.YT_CHANNEL_ID) ? process.env.YT_CHANNEL_ID : (ids[0] ?? null);
}

async function accessToken(channelId: string): Promise<string> {
  const cfg = readConfig();
  const entry = cfg?.store.channels[channelId];
  if (!cfg || !entry) throw new Error("YouTube Analytics is not connected for this channel");
  const res = await fetch(cfg.client.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: entry.refresh_token, client_id: cfg.client.client_id, client_secret: cfg.client.client_secret }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(`YouTube token refresh failed: ${data.error ?? res.status}`);
  return data.access_token;
}

async function report(channelId: string, token: string, params: Record<string, string>) {
  const url = `https://youtubeanalytics.googleapis.com/v2/reports?${new URLSearchParams({ ids: `channel==${channelId}`, ...params })}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const data = (await res.json()) as { columnHeaders?: { name: string }[]; rows?: (string | number)[][]; error?: { message: string } };
  if (!res.ok) throw new Error(`YouTube Analytics: ${data.error?.message ?? res.status}`);
  const cols = (data.columnHeaders ?? []).map((c) => c.name);
  return (data.rows ?? []).map((row) => Object.fromEntries(row.map((v, i) => [cols[i], v])) as Record<string, number | string>);
}

export interface ChannelVideo {
  id: string;
  title: string;
  durationSeconds: number;
}

/** Recent public uploads from the channel's Videos tab (excludes Shorts and live streams). */
export async function listUploads(channelId: string, max = 30): Promise<ChannelVideo[]> {
  const { stdout } = await run("yt-dlp", ["--flat-playlist", "-J", "--playlist-end", String(max), `https://www.youtube.com/channel/${channelId}/videos`], { maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
  const data = JSON.parse(stdout) as { entries?: { id: string; title: string; duration?: number }[] };
  return (data.entries ?? []).filter((e) => e.duration).map((e) => ({ id: e.id, title: e.title, durationSeconds: e.duration! }));
}

export async function fetchRetention(channelId: string, videoId: string): Promise<{ points: RetentionPoint[]; metrics: VideoMetrics }> {
  const token = await accessToken(channelId);
  const today = new Date().toISOString().slice(0, 10);
  const [curve, totals] = await Promise.all([
    report(channelId, token, {
      startDate: "2015-01-01",
      endDate: today,
      dimensions: "elapsedVideoTimeRatio",
      metrics: "audienceWatchRatio,relativeRetentionPerformance",
      filters: `video==${videoId}`,
    }),
    report(channelId, token, {
      startDate: "2015-01-01",
      endDate: today,
      dimensions: "video",
      metrics: "views,averageViewPercentage,averageViewDuration,subscribersGained",
      filters: `video==${videoId}`,
    }),
  ]);
  const t = totals[0] ?? {};
  return {
    points: curve.map((r) => ({ ratio: Number(r.elapsedVideoTimeRatio), watchRatio: Number(r.audienceWatchRatio), relativePerformance: Number(r.relativeRetentionPerformance) })),
    metrics: {
      views: Number(t.views ?? 0),
      averageViewPercentage: Number(t.averageViewPercentage ?? 0),
      averageViewDuration: Number(t.averageViewDuration ?? 0),
      subscribersGained: Number(t.subscribersGained ?? 0),
    },
  };
}

export const youtubeUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
