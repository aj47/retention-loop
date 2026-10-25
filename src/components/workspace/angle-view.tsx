"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/client";
import type { Direction, Directions } from "@/lib/director/schemas";
import type { Lesson } from "@/lib/memory/lessons";
import { Badge, Button, Card, ErrorNote, ModelTag } from "../ui";
import type { WorkspaceProps } from "./workspace";
import { fmtDateTime } from "@/lib/format";

const PUSHES = ["more original", "more practical", "more entertaining", "more technical", "more surprising"];

export function AngleView({ bundle, reload, go }: WorkspaceProps) {
  const pid = bundle.project.id;
  const ideaArt = bundle.artifacts.idea;
  const generated = useMemo(
    () => (ideaArt?.versions ?? []).filter((v) => v.origin === "director" && v.data.directions).reverse(),
    [ideaArt],
  );
  const [idea, setIdea] = useState(ideaArt?.current?.content ?? bundle.project.intent ?? "");
  const [constraints, setConstraints] = useState("");
  const [setIndex, setSetIndex] = useState(0);
  const [fresh, setFresh] = useState<{ data: Directions; model: string; lessons: Lesson[] } | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [why, setWhy] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const brief = bundle.artifacts.brief?.current;
  const [briefText, setBriefText] = useState(brief?.content ?? "");

  const shown = fresh ?? (generated[setIndex] ? { data: generated[setIndex].data.directions as Directions, model: generated[setIndex].model ?? "", lessons: [] } : null);

  async function run<T>(key: string, fn: () => Promise<T>) {
    setBusy(key);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const explore = (push?: string) =>
    run(push ?? "explore", async () => {
      const res = await api<{ data: Directions; model: string; lessons: Lesson[] }>(`/api/projects/${pid}/directions`, {
        json: { idea, constraints: constraints || undefined, push, previous: push ? shown?.data.directions : undefined },
      });
      setFresh(res);
      setPicked(new Set());
      setWhy(null);
      await reload();
    });

  const buildBrief = () =>
    run("brief", async () => {
      const directions = [...picked].map((i) => shown!.data.directions[i]);
      const res = await api<{ version: { content: string } }>(`/api/projects/${pid}/brief`, { json: { directions, notes: notes || undefined } });
      setBriefText(res.version.content);
      await reload();
    });

  const saveBrief = () =>
    run("save", async () => {
      await api(`/api/projects/${pid}/artifacts/brief`, { method: "PUT", json: { content: briefText, label: "Edited brief" } });
      await reload();
    });

  const draft = () =>
    run("draft", async () => {
      if (briefText !== brief?.content) await api(`/api/projects/${pid}/artifacts/brief`, { method: "PUT", json: { content: briefText, label: "Edited brief" } });
      await api(`/api/projects/${pid}/script/draft`, { json: {} });
      await reload();
      go("script");
    });

  const lessonsFor = (d: Direction) => (fresh?.lessons ?? []).filter((l) => d.lessonIds.includes(l.id));

  return (
    <div className="grid max-w-5xl gap-6">
      <Card className="p-4">
        <label className="text-xs font-medium text-muted">Your idea</label>
        <textarea
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          rows={2}
          className="mt-1 block w-full resize-y bg-transparent text-[15px] outline-none"
          placeholder="What do you want to make?"
        />
        <input
          value={constraints}
          onChange={(e) => setConstraints(e.target.value)}
          placeholder="Constraints (optional): length, tone, audience, what you can film…"
          className="mt-2 w-full border-t border-line pt-2 text-sm outline-none placeholder:text-faint"
        />
        <div className="mt-3 flex items-center gap-2">
          <Button variant="primary" onClick={() => explore()} busy={busy === "explore"} disabled={!idea.trim() || !!busy}>
            {shown ? "Explore new directions" : "Explore directions"}
          </Button>
          {generated.length > 1 && !fresh && (
            <select value={setIndex} onChange={(e) => setSetIndex(Number(e.target.value))} className="rounded-md border border-line bg-card px-2 py-1 text-sm">
              {generated.map((g, i) => (
                <option key={g.id} value={i}>
                  {g.label} · {fmtDateTime(g.createdAt)}
                </option>
              ))}
            </select>
          )}
        </div>
      </Card>

      <ErrorNote error={error} />

      {shown && (
        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted">{shown.data.channelNote}</p>
            <ModelTag model={shown.model} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {shown.data.directions.map((d, i) => (
              <Card key={i} className={`flex flex-col p-4 transition-colors ${picked.has(i) ? "border-accent ring-1 ring-accent" : ""}`}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{d.title}</h3>
                  <Badge kind={d.mode} />
                </div>
                <p className="text-sm">{d.premise}</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Opening</dt>
                    <dd className="italic">“{d.opening}”</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">For</dt>
                    <dd>{d.intendedViewer}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Promise</dt>
                    <dd>{d.promise}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Narrative</dt>
                    <dd>{d.narrative}</dd>
                  </div>
                </dl>
                {why === i && (
                  <div className="mt-3 rounded-md bg-paper p-2 text-xs">
                    <p>{d.whyInteresting}</p>
                    {lessonsFor(d).map((l) => (
                      <p key={l.id} className="mt-1.5 text-muted">
                        <Badge kind={l.status} /> {l.claim}
                      </p>
                    ))}
                    {!d.lessonIds.length && <p className="mt-1.5 text-faint">No channel lessons informed this direction.</p>}
                  </div>
                )}
                <div className="mt-auto flex gap-2 pt-4">
                  <Button
                    variant={picked.has(i) ? "primary" : "secondary"}
                    onClick={() => setPicked((s) => (s.has(i) ? new Set([...s].filter((x) => x !== i)) : new Set(s).add(i)))}
                  >
                    {picked.has(i) ? "Selected" : "Select"}
                  </Button>
                  <Button variant="ghost" onClick={() => setWhy(why === i ? null : i)}>
                    Why this direction?
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted">Push further:</span>
            {PUSHES.map((p) => (
              <Button key={p} variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => explore(p)} busy={busy === p} disabled={!!busy}>
                {p}
              </Button>
            ))}
          </div>
          {picked.size > 0 && (
            <Card className="mt-4 p-4">
              <p className="text-sm font-medium">
                {picked.size > 1 ? `Combine ${picked.size} directions into one brief` : "Turn this direction into a brief"}
              </p>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything to change? Tone, audience, what to keep from each…"
                className="mt-2 w-full rounded-md border border-line px-2 py-1.5 text-sm outline-none focus:border-faint"
              />
              <Button variant="primary" className="mt-3" onClick={buildBrief} busy={busy === "brief"} disabled={!!busy}>
                Build brief
              </Button>
            </Card>
          )}
        </section>
      )}

      {(brief || briefText) && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="font-semibold">Creative brief</h2>
            <ModelTag model={brief?.model} />
          </div>
          <Card className="p-0">
            <textarea
              value={briefText}
              onChange={(e) => setBriefText(e.target.value)}
              rows={Math.min(28, briefText.split("\n").length + 2)}
              className="block w-full resize-y rounded-lg bg-transparent p-4 font-mono text-[13px] leading-relaxed outline-none"
            />
          </Card>
          <div className="mt-3 flex gap-2">
            <Button onClick={saveBrief} busy={busy === "save"} disabled={!!busy || briefText === brief?.content}>
              Save edits
            </Button>
            <Button variant="primary" onClick={draft} busy={busy === "draft"} disabled={!!busy}>
              Draft a script from this brief
            </Button>
            {bundle.artifacts.script && (
              <Button variant="ghost" onClick={() => go("script")}>
                Go to script →
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
