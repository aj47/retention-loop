import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { NextVideoButton } from "@/components/next-video-button";
import { getChannel } from "@/lib/memory/lessons";
import { buildOpportunities } from "@/lib/opportunities";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const [items, channel] = await Promise.all([buildOpportunities(), getChannel()]);
  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <PageHeader
        title="Opportunities"
        description="A short list of next actions from your projects, findings, and channel lessons."
        actions={<NextVideoButton channelName={channel?.name} />}
      />
      {items.length === 0 ? (
        <Card className="p-5 text-sm text-muted">
          Opportunities appear as you work: analyze a published video&apos;s retention, save lessons to Channel Memory, or start a project.{" "}
          {!channel && (
            <>
              <Link href="/settings" className="underline">Describe your channel</Link> so next-video directions are personalized.
            </>
          )}
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((o) => (
            <li key={o.id}>
              <Card className="p-4">
                <p className="text-[11px] font-medium tracking-wide text-accent uppercase">{o.kind}</p>
                <p className="mt-1 font-medium">{o.title}</p>
                <p className="mt-1 text-sm text-muted">{o.why}</p>
                <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                  {o.evidence && (
                    <div>
                      <dt className="inline text-faint">Evidence </dt>
                      <dd className="inline">{o.evidence}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="inline text-faint">Effort </dt>
                    <dd className="inline">{o.effort}</dd>
                  </div>
                  {o.uncertainty && (
                    <div>
                      <dt className="inline text-faint">Uncertainty </dt>
                      <dd className="inline">{o.uncertainty}</dd>
                    </div>
                  )}
                </dl>
                <Link href={o.href} className="mt-3 inline-block rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-white">
                  {o.action}
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
