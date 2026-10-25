"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { ProjectBundle } from "@/lib/projects/service";
import { AngleView } from "./angle-view";
import { CutView } from "./cut-view";
import { ScriptView } from "./script-view";
import { ViewersView } from "./viewers-view";

export type View = "angle" | "script" | "cut" | "viewers";

const TABS: { id: View; label: string; hint: string }[] = [
  { id: "angle", label: "Find the angle", hint: "Idea → directions → brief" },
  { id: "script", label: "Rewrite together", hint: "Script alternatives" },
  { id: "cut", label: "See the better cut", hint: "Rough cut → proposed cut" },
  { id: "viewers", label: "Learn from viewers", hint: "Retention → lessons" },
];

export interface WorkspaceProps {
  bundle: ProjectBundle;
  reload: () => Promise<void>;
  go: (v: View) => void;
}

export function Workspace({ initial, initialView }: { initial: ProjectBundle; initialView: View }) {
  const router = useRouter();
  const [bundle, setBundle] = useState(initial);
  const [view, setView] = useState<View>(initialView);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const title = titleDraft ?? bundle.project.title;

  const reload = useCallback(async () => {
    setBundle(await api<ProjectBundle>(`/api/projects/${initial.project.id}`));
  }, [initial.project.id]);

  const go = useCallback(
    (v: View) => {
      setView(v);
      router.replace(`/projects/${initial.project.id}?view=${v}`, { scroll: false });
    },
    [router, initial.project.id],
  );

  // Poll while background work (media preparation, renders) is in flight.
  const busy = bundle.jobs.some((j) => j.status === "queued" || j.status === "running");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => void reload(), 2000);
    return () => clearInterval(t);
  }, [busy, reload]);

  const saveTitle = async () => {
    if (title.trim() && title !== bundle.project.title) {
      await api(`/api/projects/${bundle.project.id}`, { method: "PATCH", json: { title } });
      await reload();
    }
    setTitleDraft(null);
  };

  const props = { bundle, reload, go };
  return (
    <div className="px-8 py-6">
      <div className="mb-5 flex items-center gap-3">
        <input
          value={title}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="min-w-0 flex-1 bg-transparent text-xl font-semibold tracking-tight outline-none"
          aria-label="Project title"
        />
        {busy && <span className="text-xs text-muted">{bundle.jobs.find((j) => j.status === "running")?.stage ?? "Queued"}…</span>}
      </div>
      <div className="mb-6 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => go(t.id)}
            title={t.hint}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${view === t.id ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {view === "angle" && <AngleView {...props} />}
      {view === "script" && <ScriptView {...props} />}
      {view === "cut" && <CutView {...props} />}
      {view === "viewers" && <ViewersView {...props} />}
    </div>
  );
}
