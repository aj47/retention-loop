<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Retention Loop

- Product spec: `docs/spec.md`. Keep observations, hypotheses, and historical associations separate everywhere; never present an unrendered edit as playable.
- Pure logic lives in `src/lib/{script,edit,analytics}` and is unit-tested in `tests/`. Run `pnpm test`, `pnpm typecheck`, and `pnpm lint` before committing.
- Gemini is the only AI provider. `src/lib/director/model.ts` calls the Interactions API (`@google/genai`) with JSON-schema structured output: `gemini-4-argon` leads (editorial decisions, video understanding, self-check, channel memory), `gemini-3.8-flash` handles parallel per-video cards, selection rewrites, and shot plans. Every Director function has an offline fallback in `offline.ts`.
- Video goes to Gemini as Files API uploads (540p proxies, re-uploaded after 46h) or public YouTube URLs, always with `processing: "agentic"`. Video and long-context calls run with `background: true` and are polled.
- YouTube access is read-only (`yt-analytics.readonly`) from `YT_ANALYTICS_CONFIG_DIR`; uploads are listed with `yt-dlp`. Never add write scopes.
- Format dates with `src/lib/format.ts`, not `toLocale*`, to avoid hydration mismatches.
- Migrations in `src/lib/db/migrations.ts` are append-only; mirror any change in `schema.ts`.
