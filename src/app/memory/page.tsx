import { MemoryBoard } from "@/components/memory-board";
import { PageHeader } from "@/components/ui";
import { listLessons } from "@/lib/memory/lessons";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const lessons = await listLessons(true);
  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <PageHeader
        title="Channel Memory"
        description="What the Director has learned about your channel. Lessons guide suggestions; they never limit what you can make."
      />
      <MemoryBoard initial={JSON.parse(JSON.stringify(lessons))} />
    </div>
  );
}
