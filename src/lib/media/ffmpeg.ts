import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { MediaProbe, TimeRange, TimelineSegmentMap, Transcript } from "@/lib/db/schema";

const run = promisify(execFile);
const FFMPEG = process.env.RL_FFMPEG ?? "ffmpeg";
const FFPROBE = process.env.RL_FFPROBE ?? "ffprobe";

function ffmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ["-hide_banner", "-nostdin", ...args]);
    let stderr = "";
    p.stderr.on("data", (d) => {
      stderr += d;
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
    });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(stderr) : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`))));
  });
}

export async function probe(file: string): Promise<MediaProbe> {
  const { stdout } = await run(FFPROBE, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  const info = JSON.parse(stdout) as {
    format: { duration?: string };
    streams: { codec_type: string; codec_name?: string; width?: number; height?: number; avg_frame_rate?: string; sample_rate?: string; duration?: string }[];
  };
  const v = info.streams.find((s) => s.codec_type === "video");
  const a = info.streams.find((s) => s.codec_type === "audio");
  const fps = (() => {
    if (!v?.avg_frame_rate) return undefined;
    const [n, d] = v.avg_frame_rate.split("/").map(Number);
    return d ? Math.round((n / d) * 1000) / 1000 : undefined;
  })();
  const duration = Number(info.format.duration ?? v?.duration ?? a?.duration ?? 0);
  if (!duration) throw new Error("Could not read media duration");
  return {
    duration,
    width: v?.width,
    height: v?.height,
    fps,
    videoCodec: v?.codec_name,
    audioCodec: a?.codec_name,
    audioSampleRate: a?.sample_rate ? Number(a.sample_rate) : undefined,
    hasVideo: Boolean(v),
    hasAudio: Boolean(a),
  };
}

/** Browser-friendly low-resolution proxy used for comparison playback. */
export async function makeProxy(input: string, output: string, info: MediaProbe): Promise<void> {
  const args = ["-y", "-i", input];
  if (info.hasVideo) args.push("-vf", "scale=-2:'min(540,ih)'", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p");
  else args.push("-vn");
  if (info.hasAudio) args.push("-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "48000");
  args.push("-movflags", "+faststart", output);
  await ffmpeg(args);
}

export async function detectSilences(file: string, noiseDb = -35, minSeconds = 0.4): Promise<TimeRange[]> {
  const log = await ffmpeg(["-i", file, "-vn", "-af", `silencedetect=noise=${noiseDb}dB:d=${minSeconds}`, "-f", "null", "-"]);
  const out: TimeRange[] = [];
  let start: number | null = null;
  for (const line of log.split("\n")) {
    const s = line.match(/silence_start: (-?[\d.]+)/);
    const e = line.match(/silence_end: ([\d.]+)/);
    if (s) start = Math.max(0, Number(s[1]));
    if (e && start != null) {
      out.push({ start, end: Number(e[1]) });
      start = null;
    }
  }
  return out;
}

type Transcriber = { kind: "whisper-cli"; model: string } | { kind: "whisper"; model: string } | null;

export function transcriber(): Transcriber {
  const pref = process.env.RL_TRANSCRIBER;
  if (pref === "none") return null;
  const cppModel = process.env.RL_WHISPER_CPP_MODEL;
  if ((pref === "whisper-cli" || !pref) && cppModel && existsSync(cppModel)) return { kind: "whisper-cli", model: cppModel };
  if (pref === "whisper" || !pref) return { kind: "whisper", model: process.env.RL_WHISPER_MODEL ?? "base" };
  return null;
}

/** Transcribes with a local Whisper. Returns null when no transcriber is available. */
export async function transcribe(file: string): Promise<Transcript | null> {
  const t = transcriber();
  if (!t) return null;
  const dir = await mkdtemp(path.join(tmpdir(), "rl-asr-"));
  try {
    const wav = path.join(dir, "audio.wav");
    await ffmpeg(["-y", "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav]);
    if (t.kind === "whisper-cli") {
      await run("whisper-cli", ["-m", t.model, "-f", wav, "-oj", "-of", path.join(dir, "out")], { maxBuffer: 64 * 1024 * 1024 });
      const json = JSON.parse(await readFile(path.join(dir, "out.json"), "utf8")) as {
        result?: { language?: string };
        transcription: { offsets: { from: number; to: number }; text: string }[];
      };
      return {
        engine: `whisper.cpp (${path.basename(t.model)})`,
        language: json.result?.language,
        segments: json.transcription.map((s) => ({ start: s.offsets.from / 1000, end: s.offsets.to / 1000, text: s.text.trim() })),
      };
    }
    try {
      await run("whisper", [wav, "--model", t.model, "--output_format", "json", "--output_dir", dir, "--fp16", "False", "--verbose", "False"], {
        maxBuffer: 64 * 1024 * 1024,
        timeout: 60 * 60 * 1000,
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
    const json = JSON.parse(await readFile(path.join(dir, "audio.json"), "utf8")) as {
      language?: string;
      segments: { start: number; end: number; text: string }[];
    };
    return {
      engine: `openai-whisper (${t.model})`,
      language: json.language,
      segments: json.segments.map((s) => ({ start: s.start, end: s.end, text: s.text.trim() })),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Seconds of fade applied at every cut to avoid audible clicks. */
const CUT_FADE = 0.012;

/**
 * Assembles the output from source ranges in a single ffmpeg pass. The source
 * file is only read. `preview` renders a 540p proxy; otherwise source
 * resolution is kept.
 */
export async function renderTimeline(input: string, output: string, segments: TimelineSegmentMap[], info: MediaProbe, preview: boolean): Promise<void> {
  if (!segments.length) throw new Error("Nothing to render: every segment was removed");
  const parts: string[] = [];
  const labels: string[] = [];
  segments.forEach((s, i) => {
    const len = s.sourceOut - s.sourceIn;
    if (info.hasVideo) {
      const scale = preview ? ",scale=-2:'min(540,ih)'" : "";
      parts.push(`[0:v]trim=start=${s.sourceIn}:end=${s.sourceOut},setpts=PTS-STARTPTS${scale},format=yuv420p[v${i}]`);
      labels.push(`[v${i}]`);
    }
    if (info.hasAudio) {
      const fadeOut = Math.max(0, len - CUT_FADE);
      parts.push(
        // Pad then trim to the exact segment length so a source whose audio ends
        // early cannot shift every later segment out of sync with the picture.
        `[0:a]atrim=start=${s.sourceIn}:end=${s.sourceOut},asetpts=PTS-STARTPTS,aresample=48000,apad=whole_dur=${len},atrim=duration=${len},afade=t=in:st=0:d=${CUT_FADE},afade=t=out:st=${fadeOut}:d=${CUT_FADE}[a${i}]`,
      );
      labels.push(`[a${i}]`);
    }
  });
  const v = info.hasVideo ? 1 : 0;
  const a = info.hasAudio ? 1 : 0;
  parts.push(`${labels.join("")}concat=n=${segments.length}:v=${v}:a=${a}${v ? "[outv]" : ""}${a ? "[outa]" : ""}`);
  const args = ["-y", "-i", input, "-filter_complex", parts.join(";")];
  if (v) args.push("-map", "[outv]", "-c:v", "libx264", "-preset", preview ? "veryfast" : "medium", "-crf", preview ? "26" : "18", "-pix_fmt", "yuv420p");
  if (a) args.push("-map", "[outa]", "-c:a", "aac", "-b:a", preview ? "128k" : "192k");
  args.push("-movflags", "+faststart", output);
  await ffmpeg(args);
}
