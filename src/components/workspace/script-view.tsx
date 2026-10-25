"use client";

import { useMemo, useRef, useState } from "react";
import { api, download } from "@/lib/client";
import type { Rewrite, ShotPlan } from "@/lib/director/schemas";
import type { ArtifactVersion } from "@/lib/projects/service";
import { changeIds, diffScripts, splitParagraphs, type ScriptBlock } from "@/lib/script/diff";
import { ReviewPanel } from "../review-panel";
import { Badge, Button, Card, ErrorNote, ModelTag } from "../ui";
import type { WorkspaceProps } from "./workspace";
import { fmtDateTime, fmtTime } from "@/lib/format";

const TREATMENTS = [
  { id: "payoff_first", label: "Payoff first" },
  { id: "curiosity", label: "Curiosity-driven" },
  { id: "challenge", label: "Challenge-driven" },
  { id: "concise", label: "More concise" },
  { id: "custom", label: "Custom…" },
] as const;

const SELECTION_ACTIONS = ["Make tighter", "Make more compelling", "Simplify", "Increase suspense", "Improve transition", "Show the result sooner", "Preserve my tone"];

type ProposalData = { rewrite: Rewrite; baseVersionId: string; locked: string[]; lockViolations: string[] };

export function ScriptView({ bundle, reload, go }: WorkspaceProps) {
  const pid = bundle.project.id;
  const art = bundle.artifacts.script;
  const current = art?.current ?? null;
  const proposals = useMemo(() => (art?.versions ?? []).filter((v) => v.origin === "director" && v.data.rewrite).reverse(), [art]);
  const history = useMemo(() => (art?.versions ?? []).filter((v) => !v.data.rewrite).reverse(), [art]);

  const [text, setText] = useState(current?.content ?? "");
  const [proposalId, setProposalId] = useState<string | null>(proposals.find((p) => p.data.baseVersionId === current?.id)?.id ?? null);
  const [treatment, setTreatment] = useState<(typeof TREATMENTS)[number]["id"]>("payoff_first");
  const [custom, setCustom] = useState("");
  const [locked, setLocked] = useState<string[]>([]);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [alts, setAlts] = useState<{ action: string; options: string[]; model: string } | null>(null);
  const [showStructure, setShowStructure] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);

  // Reset the editor when the current version changes (save, accept, restore).
  const [syncedId, setSyncedId] = useState(current?.id);
  if (current?.id !== syncedId) {
    setSyncedId(current?.id);
    setText(current?.content ?? "");
  }

  const proposal = proposals.find((p) => p.id === proposalId) ?? null;
  const pdata = proposal?.data as ProposalData | undefined;
  const base = useMemo(() => art?.versions.find((v) => v.id === pdata?.baseVersionId) ?? null, [art, pdata]);
  const blocks = useMemo(() => (proposal && base ? diffScripts(base.content, proposal.content, pdata?.locked ?? locked) : []), [proposal, base, pdata, locked]);
  const hunks = changeIds(blocks);
  const stale = proposal && base && current && base.id !== current.id;
  const dirty = text !== (current?.content ?? "");

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

  const save = (label = "Edited") =>
    run("save", async () => {
      await api(`/api/projects/${pid}/artifacts/script`, { method: "PUT", json: { content: text, label } });
      await reload();
    });

  const propose = () =>
    run("propose", async () => {
      if (dirty) await api(`/api/projects/${pid}/artifacts/script`, { method: "PUT", json: { content: text, label: "Edited" } });
      const res = await api<{ version: ArtifactVersion }>(`/api/projects/${pid}/script/rewrite`, {
        json: { treatment, custom: treatment === "custom" ? custom : undefined, locked },
      });
      await reload();
      setProposalId(res.version.id);
      setRejected(new Set());
    });

  const apply = (ids: string[]) =>
    run("apply", async () => {
      await api(`/api/projects/${pid}/script/accept`, {
        json: { baseVersionId: base!.id, proposalVersionId: proposal!.id, acceptedHunks: ids, locked: pdata?.locked ?? locked },
      });
      setProposalId(null);
      await reload();
    });

  const restore = (v: ArtifactVersion) =>
    run(`restore-${v.id}`, async () => {
      await api(`/api/projects/${pid}/script/restore`, { json: { versionId: v.id } });
      await reload();
    });

  const shotPlan = () =>
    run("shots", async () => {
      if (dirty) await api(`/api/projects/${pid}/artifacts/script`, { method: "PUT", json: { content: text, label: "Edited" } });
      await api(`/api/projects/${pid}/shotplan`, { json: {} });
      await reload();
    });

  const selectionAction = (action: string) =>
    run("selection", async () => {
      const sel = text.slice(selection!.start, selection!.end);
      const res = await api<{ data: { alternatives: string[] }; model: string }>(`/api/projects/${pid}/script/selection`, {
        json: { script: text, selection: sel, action },
      });
      setAlts({ action, options: res.data.alternatives, model: res.model });
    });

  const replaceSelection = (replacement: string) => {
    if (!selection) return;
    setText(text.slice(0, selection.start) + replacement + text.slice(selection.end));
    setSelection(null);
    setAlts(null);
  };

  const toggleLock = (p: string) => setLocked((l) => (l.includes(p) ? l.filter((x) => x !== p) : [...l, p]));

  if (!art) {
    return (
      <div className="max-w-3xl">
        <Card className="p-5">
          <p className="text-sm text-muted">Paste a draft script to start, or build a brief in Find the angle and draft from it.</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} className="mt-3 block w-full resize-y rounded-md border border-line p-3 text-[15px] outline-none" />
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={() => save("Imported draft")} disabled={!text.trim()} busy={busy === "save"}>
              Save script
            </Button>
            <Button variant="ghost" onClick={() => go("angle")}>
              Find the angle first
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const shots = bundle.artifacts.shot_plan?.current;
  const rewrite = pdata?.rewrite;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0 space-y-4">
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <span className="text-xs text-muted">Treatment</span>
          {TREATMENTS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTreatment(t.id)}
              className={`rounded-md px-2 py-1 text-sm ${treatment === t.id ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-ink"}`}
            >
              {t.label}
            </button>
          ))}
          {treatment === "custom" && (
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Describe the direction"
              className="min-w-48 flex-1 rounded-md border border-line px-2 py-1 text-sm outline-none"
            />
          )}
          <Button variant="primary" className="ml-auto" onClick={propose} busy={busy === "propose"} disabled={!!busy || !text.trim()}>
            {proposal ? "Another alternative" : "Propose an alternative"}
          </Button>
        </Card>

        <ErrorNote error={error} />

        {proposal && base && rewrite ? (
          <ProposalPanel
            blocks={blocks}
            hunks={hunks}
            rewrite={rewrite}
            proposal={proposal}
            violations={pdata?.lockViolations ?? []}
            locked={pdata?.locked ?? locked}
            rejected={rejected}
            setRejected={setRejected}
            stale={Boolean(stale)}
            busy={busy}
            onApply={apply}
            onClose={() => setProposalId(null)}
            showStructure={showStructure}
            setShowStructure={setShowStructure}
          />
        ) : (
          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-line px-4 py-2">
              <p className="text-xs text-muted">
                Current script · {current?.label} {locked.length > 0 && `· ${locked.length} locked`}
              </p>
              <div className="flex gap-1">
                <Button variant="ghost" className="!py-1 text-xs" onClick={() => setShowStructure((s) => !s)}>
                  {showStructure ? "Edit text" : "Lock passages"}
                </Button>
                <Button variant="ghost" className="!py-1 text-xs" onClick={() => download(`${bundle.project.title}.md`, text, "text/markdown")}>
                  Export
                </Button>
              </div>
            </div>
            {showStructure ? (
              <div className="prose-script space-y-1 p-4">
                <p className="mb-3 text-xs text-muted">Lock any paragraph the Director must keep word for word.</p>
                {splitParagraphs(text).map((p, i) => (
                  <div key={i} className={`group flex gap-2 rounded px-2 py-1 ${locked.includes(p) ? "bg-accent-soft" : "hover:bg-paper"}`}>
                    <button onClick={() => toggleLock(p)} className="mt-0.5 shrink-0 text-xs text-muted hover:text-accent" title={locked.includes(p) ? "Unlock" : "Lock"}>
                      {locked.includes(p) ? "🔒" : "○"}
                    </button>
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{p}</p>
                  </div>
                ))}
              </div>
            ) : (
              <textarea
                ref={editor}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onSelect={(e) => {
                  const t = e.currentTarget;
                  setSelection(t.selectionEnd - t.selectionStart > 3 ? { start: t.selectionStart, end: t.selectionEnd } : null);
                  setAlts(null);
                }}
                rows={Math.min(40, Math.max(12, text.split("\n").length + 2))}
                className="block w-full resize-y bg-transparent p-4 text-[15px] leading-relaxed outline-none"
              />
            )}
            {selection && !showStructure && (
              <div className="border-t border-line bg-paper px-4 py-2">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="mr-1 text-xs text-muted">Selection:</span>
                  {SELECTION_ACTIONS.map((a) => (
                    <Button key={a} variant="ghost" className="!px-2 !py-0.5 text-xs" onClick={() => selectionAction(a)} disabled={!!busy}>
                      {a}
                    </Button>
                  ))}
                  {busy === "selection" && <span className="text-xs text-muted">Thinking…</span>}
                </div>
                {alts && (
                  <ul className="mt-2 space-y-1.5">
                    {alts.options.map((o, i) => (
                      <li key={i}>
                        <button onClick={() => replaceSelection(o)} className="w-full rounded-md border border-line bg-card px-3 py-2 text-left text-sm hover:border-accent">
                          {o}
                        </button>
                      </li>
                    ))}
                    <li className="flex items-center gap-2 text-xs text-faint">
                      Click one to replace your selection · <ModelTag model={alts.model} />
                    </li>
                  </ul>
                )}
              </div>
            )}
            {dirty && (
              <div className="flex gap-2 border-t border-line px-4 py-2">
                <Button variant="primary" onClick={() => save()} busy={busy === "save"}>
                  Save version
                </Button>
                <Button variant="ghost" onClick={() => setText(current?.content ?? "")}>
                  Discard
                </Button>
              </div>
            )}
          </Card>
        )}

        {(proposal ?? current) && (
          <ReviewPanel key={(proposal ?? current)!.id} targetType="script" targetId={(proposal ?? current)!.id} projectId={pid} />
        )}

        <section>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="font-semibold">Shot plan</h2>
            {shots && <ModelTag model={shots.model} />}
            <Button className="ml-auto" onClick={shotPlan} busy={busy === "shots"} disabled={!!busy}>
              {shots ? "Regenerate from current script" : "Generate shot plan"}
            </Button>
            {shots && (
              <Button variant="ghost" onClick={() => download(`${bundle.project.title} — shot plan.md`, shots.content, "text/markdown")}>
                Export
              </Button>
            )}
          </div>
          {shots ? <ShotList plan={shots.data.plan as ShotPlan} /> : <p className="text-sm text-muted">Turn the approved script into shots, B-roll, on-screen text, and timings.</p>}
        </section>
      </div>

      <aside className="space-y-4">
        {proposals.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Alternatives</h3>
            <ul className="space-y-1">
              {proposals.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => setProposalId(p.id)}
                    className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${p.id === proposalId ? "bg-card ring-1 ring-line" : "hover:bg-card"}`}
                  >
                    {p.label.replace("Alternative — ", "")}
                    <span className="block text-[11px] text-faint">{fmtDateTime(p.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <h3 className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">History</h3>
          <ul className="space-y-1">
            {history.map((v) => (
              <li key={v.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate" title={v.label}>
                  {v.label}
                  <span className="block text-[11px] text-faint">
                    {v.origin} · {fmtTime(v.createdAt)}
                  </span>
                </span>
                {v.id === current?.id ? (
                  <span className="text-[11px] text-accent">current</span>
                ) : (
                  <Button variant="ghost" className="!px-1.5 !py-0.5 text-xs" onClick={() => restore(v)} busy={busy === `restore-${v.id}`}>
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function ProposalPanel(props: {
  blocks: ScriptBlock[];
  hunks: string[];
  rewrite: Rewrite;
  proposal: ArtifactVersion;
  violations: string[];
  locked: string[];
  rejected: Set<string>;
  setRejected: (s: Set<string>) => void;
  stale: boolean;
  busy: string | null;
  onApply: (ids: string[]) => void;
  onClose: () => void;
  showStructure: boolean;
  setShowStructure: (f: (s: boolean) => boolean) => void;
}) {
  const { blocks, hunks, rewrite, proposal, rejected, setRejected } = props;
  const accepted = hunks.filter((h) => !rejected.has(h));
  const linkedOf = (id: string) => {
    const b = blocks.find((x) => x.kind === "change" && x.id === id);
    return b && b.kind === "change" ? b.linked : [];
  };
  // Linked hunks (two halves of a moved passage) are kept or rejected together.
  const toggle = (id: string) => {
    const next = new Set(rejected);
    const ids = [id, ...linkedOf(id)];
    if (next.has(id)) ids.forEach((x) => next.delete(x));
    else ids.forEach((x) => next.add(x));
    setRejected(next);
  };

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{proposal.label.replace("Alternative — ", "Director's alternative — ")}</p>
          <ModelTag model={proposal.model} />
          <Button variant="ghost" className="ml-auto" onClick={props.onClose}>
            Close
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted">{rewrite.summary}</p>
        {props.stale && <p className="mt-2 text-xs text-amber-700">Your script changed after this alternative was generated; changes apply to the version it was based on.</p>}
        {props.violations.length > 0 && <p className="mt-2 text-xs text-del-ink">The Director altered {props.violations.length} locked passage(s); those changes cannot be applied.</p>}
        {rewrite.changes.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {rewrite.changes.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent">•</span>
                <span>
                  {c.purpose}
                  {c.lessonIds.length > 0 && (<a href={`/memory#${c.lessonIds[0]}`} className="ml-1.5 rounded bg-amber-50 px-1 text-[11px] text-amber-800 hover:underline">applies {c.lessonIds.length} channel lesson{c.lessonIds.length > 1 ? "s" : ""}</a>)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => props.onApply(hunks)} busy={props.busy === "apply"} disabled={!hunks.length}>
            Accept all ({hunks.length})
          </Button>
          {accepted.length !== hunks.length && (
            <Button onClick={() => props.onApply(accepted)} busy={props.busy === "apply"}>
              Apply {accepted.length} selected
            </Button>
          )}
          <Button variant="ghost" onClick={() => props.setShowStructure((s) => !s)}>
            {props.showStructure ? "Hide structure" : "Structure & diagnostics"}
          </Button>
        </div>
      </Card>

      {props.showStructure && (
        <Card className="p-4 text-sm">
          <p className="mb-2 text-xs font-medium text-muted">Narrative beats (proposed)</p>
          <ol className="flex flex-wrap items-center gap-1.5">
            {rewrite.beats.map((b, i) => (
              <li key={i} className="flex items-center gap-1.5" title={b.summary}>
                <span className="rounded bg-paper px-2 py-0.5">{b.name}</span>
                {i < rewrite.beats.length - 1 && <span className="text-faint">→</span>}
              </li>
            ))}
          </ol>
          {rewrite.diagnostics.length > 0 && (
            <>
              <p className="mt-4 mb-2 text-xs font-medium text-muted">About the original</p>
              <ul className="space-y-1">
                {rewrite.diagnostics.map((d, i) => (
                  <li key={i}>
                    <span className="mr-2 text-xs text-muted">{d.aspect.replace(/_/g, " ")}</span>
                    {d.observation}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-x-4 text-xs font-medium text-muted">
        <p>Original</p>
        <p>Director&apos;s alternative</p>
      </div>
      <div className="space-y-2">
        {blocks.map((b, i) =>
          b.kind === "same" ? (
            <div key={i} className="grid grid-cols-2 gap-x-4 text-[15px] leading-relaxed text-muted">
              <div className="prose-script">
                {b.paragraphs.map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
              </div>
              <div className="prose-script">
                {b.paragraphs.map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
              </div>
            </div>
          ) : (
            <div key={i} className={`grid grid-cols-2 gap-x-4 rounded-lg border p-3 text-[15px] leading-relaxed ${rejected.has(b.id) ? "border-line bg-card opacity-60" : "border-accent/40 bg-card"}`}>
              <div className="whitespace-pre-wrap">
                {b.words.map((w, k) => (w.added ? null : <span key={k} className={w.removed ? "bg-del text-del-ink line-through decoration-del-ink/40" : ""}>{w.value}</span>))}
                {!b.original.length && <span className="text-xs text-faint">(new)</span>}
              </div>
              <div>
                <div className="whitespace-pre-wrap">
                  {b.words.map((w, k) => (w.removed ? null : <span key={k} className={w.added ? "bg-add text-add-ink" : ""}>{w.value}</span>))}
                  {!b.proposed.length && <span className="text-xs text-faint">(removed)</span>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {b.linked.length > 0 && <span className="text-xs text-violet-700">Moved text — applies with {b.linked.length} other change{b.linked.length > 1 ? "s" : ""}</span>}
                  {b.touchesLocked ? (
                    <Badge kind="outdated">Locked passage — kept</Badge>
                  ) : (
                    <>
                      <Button variant={rejected.has(b.id) ? "secondary" : "primary"} className="!px-2 !py-0.5 text-xs" onClick={() => rejected.has(b.id) && toggle(b.id)}>
                        {rejected.has(b.id) ? "Keep this change" : "✓ Keeping"}
                      </Button>
                      {!rejected.has(b.id) && (
                        <Button variant="ghost" className="!px-2 !py-0.5 text-xs" onClick={() => toggle(b.id)}>
                          Reject
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function ShotList({ plan }: { plan: ShotPlan }) {
  return (
    <Card className="divide-y divide-line">
      {plan.shots.map((s, i) => (
        <div key={i} className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_3.5rem] gap-3 px-4 py-3 text-sm">
          <span className="text-faint">{i + 1}</span>
          <div>
            <p className="text-xs font-medium text-muted">{s.beat}</p>
            <p className="mt-0.5 line-clamp-3 text-muted italic">“{s.scriptExcerpt}”</p>
          </div>
          <div>
            <p>{s.shot}</p>
            {s.broll && <p className="mt-1 text-xs text-muted">B-roll: {s.broll}</p>}
            {s.onScreenText && <p className="mt-1 text-xs text-muted">On screen: “{s.onScreenText}”</p>}
          </div>
          <span className="text-right text-muted tabular-nums">~{s.estimatedSeconds}s</span>
        </div>
      ))}
    </Card>
  );
}
