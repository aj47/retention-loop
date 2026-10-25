import { notFound } from "next/navigation";
import { Workspace, type View } from "@/components/workspace/workspace";
import { getProjectBundle } from "@/lib/projects/service";

export const dynamic = "force-dynamic";

const VIEWS: View[] = ["angle", "script", "cut", "viewers"];

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const { view } = await searchParams;
  const bundle = await getProjectBundle(id);
  if (!bundle) notFound();
  const fallback: View = bundle.assets.length ? "cut" : bundle.artifacts.script ? "script" : "angle";
  const initial = VIEWS.includes(view as View) ? (view as View) : fallback;
  return <Workspace initial={JSON.parse(JSON.stringify(bundle))} initialView={initial} />;
}
