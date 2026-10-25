import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { listProjects } from "@/lib/projects/service";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const STAGES = [
  { id: "idea", label: "Ideas", view: "angle" },
  { id: "script", label: "Scripts", view: "script" },
  { id: "rough_cut", label: "Video projects", view: "cut" },
  { id: "published", label: "Analyzed videos", view: "viewers" },
] as const;

export default async function WorkPage({ searchParams }: PageProps<"/work">) {
  const { stage } = await searchParams;
  const projects = await listProjects();
  const filtered = stage ? projects.filter((p) => p.stage === stage) : projects;
  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <PageHeader title="My Work" description="Every idea, script, video, and analysis — one project each." />
      <div className="mb-4 flex gap-1 text-sm">
        <Link href="/work" className={`rounded-md px-2 py-1 ${!stage ? "bg-card ring-1 ring-line" : "text-muted"}`}>
          All ({projects.length})
        </Link>
        {STAGES.map((s) => (
          <Link key={s.id} href={`/work?stage=${s.id}`} className={`rounded-md px-2 py-1 ${stage === s.id ? "bg-card ring-1 ring-line" : "text-muted"}`}>
            {s.label} ({projects.filter((p) => p.stage === s.id).length})
          </Link>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing here yet. <Link href="/" className="underline">Start something</Link>.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-card">
          {filtered.map((p) => {
            const s = STAGES.find((x) => x.id === p.stage)!;
            return (
              <li key={p.id}>
                <Link href={`/projects/${p.id}?view=${s.view}`} className="flex items-center gap-4 px-4 py-3 hover:bg-paper">
                  <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
                  <span className="text-xs text-muted">{s.label.replace(/s$/, "")}</span>
                  <span className="w-28 text-right text-xs text-faint">{fmtDate(p.updatedAt)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
