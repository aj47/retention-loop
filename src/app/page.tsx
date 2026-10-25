import Link from "next/link";
import { Composer } from "@/components/composer";
import { directorMode } from "@/lib/director/model";
import { buildOpportunities } from "@/lib/opportunities";
import { getChannel } from "@/lib/memory/lessons";

export const dynamic = "force-dynamic";

export default async function DirectorPage() {
  const [opportunities, channel] = await Promise.all([buildOpportunities(), getChannel()]);
  const suggestions = opportunities.slice(0, 3);
  return (
    <div className="mx-auto max-w-2xl px-6 pt-[14vh] pb-16">
      <h1 className="text-center text-3xl font-semibold tracking-tight">What are we making better today?</h1>
      <p className="mt-2 mb-8 text-center text-muted">Bring an idea, script, rough cut, or published video. We&apos;ll pick up where you are.</p>
      <Composer />
      {!channel && (
        <p className="mt-3 text-center text-xs text-faint">
          Suggestions are unpersonalized until you{" "}
          <Link href="/settings" className="underline hover:text-ink">
            describe your channel
          </Link>
          .{directorMode() === "offline" && " The Director is running offline heuristics — add a Gemini API key for full output."}
        </p>
      )}
      {suggestions.length > 0 && (
        <ul className="mt-10 grid gap-3 sm:grid-cols-3">
          {suggestions.map((s) => (
            <li key={s.id}>
              <Link href={s.href} className="block h-full rounded-lg border border-line bg-card p-3 hover:border-faint">
                <p className="text-[11px] font-medium tracking-wide text-accent uppercase">{s.kind}</p>
                <p className="mt-1 text-sm">{s.title}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
