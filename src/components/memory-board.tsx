"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { EvidenceStrength, LessonStatus } from "@/lib/db/schema";
import type { Lesson } from "@/lib/memory/lessons";
import { Badge, Button, Card, ErrorNote } from "./ui";
import { fmtDate } from "@/lib/format";

const STATUSES: LessonStatus[] = ["observation", "hypothesis", "experimentally_supported", "inconclusive", "outdated"];
const STRENGTHS: EvidenceStrength[] = ["weak", "moderate", "strong"];

export function MemoryBoard({ initial }: { initial: Lesson[] }) {
  const [lessons, setLessons] = useState(initial);
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = async (id: string, body: Record<string, unknown>) => {
    setError(null);
    try {
      const { lesson } = await api<{ lesson: Lesson }>(`/api/lessons/${id}`, { method: "PATCH", json: body });
      setLessons((ls) => ls.map((l) => (l.id === id ? lesson : l)));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const visible = lessons.filter((l) => showArchived || !l.archived);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={() => setAdding((a) => !a)}>
          {adding ? "Cancel" : "Add a lesson"}
        </Button>
        <label className="ml-auto flex items-center gap-1.5 text-sm text-muted">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
        </label>
      </div>
      <ErrorNote error={error} />
      {adding && (
        <NewLesson
          onCreated={(l) => {
            setLessons((ls) => [l, ...ls]);
            setAdding(false);
          }}
        />
      )}
      {visible.length === 0 && !adding && (
        <Card className="p-5 text-sm text-muted">
          No lessons yet. They come from analyzing your videos&apos; retention in a project (Learn from viewers), or you can add what you already know.
        </Card>
      )}
      {visible.map((l) => (
        <LessonCard key={l.id} lesson={l} onPatch={(b) => patch(l.id, b)} />
      ))}
      <HistoryCurves />
    </div>
  );
}

function LessonCard({ lesson: l, onPatch }: { lesson: Lesson; onPatch: (b: Record<string, unknown>) => void }) {
  const [editing, setEditing] = useState(false);
  const [claim, setClaim] = useState(l.claim);
  const [applicability, setApplicability] = useState(l.applicability);
  const [counter, setCounter] = useState("");
  return (
    <Card id={l.id} className={`p-4 ${l.archived ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge kind={l.status} />
        <span className="text-xs text-muted">{l.strength} evidence</span>
        {l.origin === "gemini" && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent">Learned by Gemini 4 Argon from your videos</span>}
        {(l.scope.formats ?? []).map((f) => (
          <span key={f} className="rounded bg-paper px-1.5 py-0.5 text-[11px] text-muted">
            {f}
          </span>
        ))}
        <span className="ml-auto text-xs text-faint">Updated {fmtDate(l.updatedAt)}</span>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea value={claim} onChange={(e) => setClaim(e.target.value)} rows={2} className="block w-full rounded-md border border-line p-2 text-sm outline-none" />
          <input value={applicability} onChange={(e) => setApplicability(e.target.value)} placeholder="Applies when…" className="w-full rounded-md border border-line px-2 py-1.5 text-sm outline-none" />
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() => {
                onPatch({ claim, applicability });
                setEditing(false);
              }}
            >
              Save
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 font-medium">{l.claim}</p>
          {l.applicability && <p className="mt-1 text-sm text-muted">Applies when: {l.applicability}</p>}
        </>
      )}
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted">Supporting ({l.evidence.length})</p>
          <ul className="mt-1 space-y-0.5">
            {l.evidence.map((e, i) => (
              <li key={i}>{e.label}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs text-muted">Contradicting ({l.counterexamples.length})</p>
          <ul className="mt-1 space-y-0.5">
            {l.counterexamples.map((e, i) => (
              <li key={i}>{e.label}</li>
            ))}
          </ul>
          <form
            className="mt-1 flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (!counter.trim()) return;
              onPatch({ counterexamples: [...l.counterexamples, { label: counter.trim() }] });
              setCounter("");
            }}
          >
            <input value={counter} onChange={(e) => setCounter(e.target.value)} placeholder="Add a counterexample" className="min-w-0 flex-1 rounded border border-line px-1.5 py-0.5 text-xs outline-none" />
          </form>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs">
        <select value={l.status} onChange={(e) => onPatch({ status: e.target.value })} className="rounded border border-line bg-card px-1.5 py-1">
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select value={l.strength} onChange={(e) => onPatch({ strength: e.target.value })} className="rounded border border-line bg-card px-1.5 py-1">
          {STRENGTHS.map((s) => (
            <option key={s} value={s}>
              {s} evidence
            </option>
          ))}
        </select>
        <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => onPatch({ archived: !l.archived })}>
          {l.archived ? "Restore" : "Archive"}
        </Button>
      </div>
    </Card>
  );
}

function NewLesson({ onCreated }: { onCreated: (l: Lesson) => void }) {
  const [claim, setClaim] = useState("");
  const [applicability, setApplicability] = useState("");
  const [format, setFormat] = useState("long-form");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const { lesson } = await api<{ lesson: Lesson }>("/api/lessons", {
      json: {
        claim,
        applicability,
        status: "observation",
        strength: "weak",
        scope: { formats: [format] },
        evidence: evidence.trim() ? evidence.split("\n").filter(Boolean).map((label) => ({ label })) : [],
      },
    });
    setBusy(false);
    onCreated(lesson);
  };
  return (
    <Card className="space-y-2 p-4">
      <textarea value={claim} onChange={(e) => setClaim(e.target.value)} rows={2} placeholder="What have you noticed? e.g. “Showing the finished result in the first 20 seconds keeps more viewers in tutorials.”" className="block w-full rounded-md border border-line p-2 text-sm outline-none" />
      <input value={applicability} onChange={(e) => setApplicability(e.target.value)} placeholder="Applies when… (format, topic, audience)" className="w-full rounded-md border border-line px-2 py-1.5 text-sm outline-none" />
      <textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} rows={2} placeholder="Supporting videos, one per line" className="block w-full rounded-md border border-line p-2 text-sm outline-none" />
      <div className="flex items-center gap-2">
        <select value={format} onChange={(e) => setFormat(e.target.value)} className="rounded-md border border-line bg-card px-2 py-1 text-sm">
          <option value="long-form">Long-form</option>
          <option value="short">Short</option>
          <option value="livestream">Livestream</option>
        </select>
        <Button variant="primary" className="ml-auto" onClick={submit} busy={busy} disabled={claim.trim().length < 3}>
          Save lesson
        </Button>
      </div>
    </Card>
  );
}

type HistoryCurve = { id: string; label: string; format: string; durationSeconds: number; pointCount: number };

/** Past videos' retention, used as comparable baselines when analyzing new ones. */
function HistoryCurves() {
  const [curves, setCurves] = useState<HistoryCurve[]>([]);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [duration, setDuration] = useState("");
  const [format, setFormat] = useState("long-form");
  const [csv, setCsv] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ curves: HistoryCurve[] }>("/api/curves").then((r) => setCurves(r.curves));
  }, []);
  const seconds = duration.includes(":") ? duration.split(":").reduce((a, p) => a * 60 + Number(p), 0) : Number(duration);
  const add = async () => {
    setError(null);
    try {
      await api("/api/curves", { json: { label, csv, durationSeconds: seconds, format } });
      setCurves((await api<{ curves: HistoryCurve[] }>("/api/curves")).curves);
      setLabel("");
      setCsv("");
      setDuration("");
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <section className="pt-6">
      <h2 className="font-semibold">Past videos</h2>
      <p className="mt-1 text-sm text-muted">
        {curves.length} retention curve{curves.length === 1 ? "" : "s"} from your back catalog. With three or more of the same format, new videos are compared against their median instead of a fitted curve.
      </p>
      {curves.length > 0 && (
        <ul className="mt-2 text-sm">
          {curves.map((c) => (
            <li key={c.id} className="text-muted">
              {c.label} · {c.format} · {Math.round(c.durationSeconds / 60)} min · {c.pointCount} points
            </li>
          ))}
        </ul>
      )}
      <Button variant="ghost" className="mt-2" onClick={() => setOpen((o) => !o)}>
        {open ? "Close" : "Import a past video's retention"}
      </Button>
      {open && (
        <Card className="mt-2 space-y-2 p-4">
          <div className="flex gap-2">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Video title" className="flex-1 rounded-md border border-line px-2 py-1.5 text-sm outline-none" />
            <input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="mm:ss" className="w-24 rounded-md border border-line px-2 py-1.5 text-sm outline-none" />
            <select value={format} onChange={(e) => setFormat(e.target.value)} className="rounded-md border border-line bg-card px-2 text-sm">
              <option value="long-form">Long-form</option>
              <option value="short">Short</option>
              <option value="livestream">Livestream</option>
            </select>
          </div>
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={4} placeholder="elapsedVideoTimeRatio,audienceWatchRatio…" className="block w-full rounded-md border border-line p-2 font-mono text-xs outline-none" />
          <ErrorNote error={error} />
          <Button variant="primary" onClick={add} disabled={!label || !csv || !(seconds > 0)}>
            Add to history
          </Button>
        </Card>
      )}
    </section>
  );
}
