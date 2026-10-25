# Retention Loop

An AI Director for YouTube creators, powered by **Gemini 4 Argon**. It watches your published videos next to their real audience-retention curves, learns what your viewers respond to, and turns that into concrete changes: a better angle, a payoff-first script, and a playable recut of your own footage that it checks by watching it.

Built for the *Build with Gemini 4 Argon* hackathon. The product spec is in [docs/spec.md](docs/spec.md).

## What Gemini 4 Argon does here

| Job | Model | How |
|---|---|---|
| Learn the channel | `gemini-3.8-flash` → `gemini-4-argon` | Syncs recent uploads and retention from YouTube Analytics (read-only). Flash watches each video in parallel and annotates its hook, beats, and what was on screen at every retention drop or hold. Argon reads the whole back catalog in one long-context call and writes lessons with evidence and counterexamples. |
| Explain a drop | `gemini-4-argon` | Watches the published video (YouTube URL, agentic video understanding) at each flagged moment and separates what was observed from competing hypotheses. |
| Propose a recut | `gemini-4-argon` | Watches the actual rough cut and proposes typed edit operations (trim, remove, move, tighten pauses) with timestamped observations of what it saw. |
| Check its own work | `gemini-4-argon` | After the deterministic FFmpeg render, Argon watches the render beside the original, runs pass/fail checks (clipped words, payoff in the first 20s, broken references, jarring jumps, coherence), adjusts cut points, and re-renders for up to three rounds. |
| Ideas and scripts | `gemini-4-argon`, `gemini-3.8-flash` | Directions, briefs, drafts, and payoff-first rewrites that cite the channel lessons they applied. Flash handles selection rewrites and shot plans. |

The creator stays in control: nothing is published or uploaded to YouTube, every edit can be toggled or rejected, and source files are never modified.

## Running it

Requires Node 24+, pnpm, FFmpeg, and yt-dlp. Local Whisper (`pip install openai-whisper`) provides word-aligned transcripts for cut snapping.

```sh
pnpm install
cp .env.example .env.local   # set GEMINI_API_KEY
pnpm dev
```

YouTube: put a Desktop OAuth client (`client_secret.json`) and a `yt-analytics.readonly` refresh token (`token.json`) in `~/.config/youtube-analytics-readonly`, then open **Channel → Sync channel**. Without them, import retention CSVs per project.

Without `GEMINI_API_KEY` the app runs labelled offline heuristics.

```sh
pnpm test        # diff/merge, timeline compilation, retention analysis
pnpm typecheck
pnpm lint
```

## Architecture

- **Next.js 16 + TypeScript**, Tailwind v4, embedded Postgres (PGlite) via Drizzle in `.data/`.
- **Director** (`src/lib/director`): Interactions API calls with JSON-schema structured output validated by Zod; video and long-context calls run in the background and are polled. Editorial reasoning is separate from execution: the model proposes typed operations, `src/lib/edit` validates them, snaps cuts to sentence boundaries, classifies what is playable, and compiles a source→output timeline.
- **Media** (`src/lib/media`): FFmpeg probing, 540p proxies, silence detection, Whisper, single-pass renders with click-free joins and length-exact audio.
- **Jobs** (`src/lib/jobs`): durable in-process queue for media prep, renders, self-check rounds, channel sync, and memory synthesis; interrupted work resumes on restart.
- **Analytics** (`src/lib/analytics`): robust smoothing, comparable-video baselines, slope/residual/change-point detection, with stated resolution limits and no causal claims.
