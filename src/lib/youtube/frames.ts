import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { dataDir } from "@/lib/paths";

const run = promisify(execFile);

interface Storyboard {
  width: number;
  height: number;
  rows: number;
  columns: number;
  fragments: { url: string; duration: number }[];
}

const cacheDir = (...p: string[]) => path.join(dataDir(), "frames", ...p);

/** Highest-resolution storyboard (sprite sheets of frames) YouTube publishes for a video. */
async function storyboard(videoId: string): Promise<Storyboard> {
  const file = cacheDir(videoId, "storyboard.json");
  if (existsSync(file)) return JSON.parse(await readFile(file, "utf8"));
  const { stdout } = await run("yt-dlp", ["--js-runtimes", "node", "-J", "--skip-download", `https://www.youtube.com/watch?v=${videoId}`], { maxBuffer: 64 * 1024 * 1024, timeout: 120_000 });
  const formats = (JSON.parse(stdout).formats ?? []) as (Storyboard & { format_note?: string })[];
  const best = formats.filter((f) => f.format_note?.includes("storyboard")).sort((a, b) => b.width - a.width)[0];
  if (!best) throw new Error("No storyboard available");
  const sb: Storyboard = { width: best.width, height: best.height, rows: best.rows, columns: best.columns, fragments: best.fragments };
  await mkdir(cacheDir(videoId), { recursive: true });
  await writeFile(file, JSON.stringify(sb));
  return sb;
}

/**
 * A JPEG of the published video at roughly `t` seconds, cropped from YouTube's
 * storyboard sprite sheets (one frame every few seconds). Cached on disk.
 */
export async function youtubeFrame(videoId: string, t: number): Promise<string> {
  const sb = await storyboard(videoId);
  const perSheet = sb.rows * sb.columns;
  const frameDur = sb.fragments[0].duration / perSheet;
  const index = Math.max(0, Math.round(t / frameDur));
  const sheet = Math.min(sb.fragments.length - 1, Math.floor(index / perSheet));
  const pos = index - sheet * perSheet;
  const out = cacheDir(videoId, `${sheet}-${pos}.jpg`);
  if (existsSync(out)) return out;
  const sheetFile = cacheDir(videoId, `sheet-${sheet}.jpg`);
  if (!existsSync(sheetFile)) {
    const res = await fetch(sb.fragments[sheet].url);
    if (!res.ok) throw new Error(`Storyboard fetch failed (${res.status})`);
    await writeFile(sheetFile, Buffer.from(await res.arrayBuffer()));
  }
  const x = (pos % sb.columns) * sb.width;
  const y = Math.floor(pos / sb.columns) * sb.height;
  await run("ffmpeg", ["-loglevel", "error", "-y", "-i", sheetFile, "-vf", `crop=${sb.width}:${sb.height}:${x}:${y}`, out]);
  return out;
}

/** A JPEG from a local video file at `t` seconds. Cached on disk. */
export async function fileFrame(key: string, file: string, t: number, width = 640): Promise<string> {
  const out = cacheDir(key, `${t.toFixed(1)}-${width}.jpg`);
  if (existsSync(out)) return out;
  await mkdir(cacheDir(key), { recursive: true });
  await run("ffmpeg", ["-loglevel", "error", "-y", "-ss", String(Math.max(0, t)), "-i", file, "-frames:v", "1", "-vf", `scale=${width}:-2`, "-q:v", "4", out]);
  return out;
}
