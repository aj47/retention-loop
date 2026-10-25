import { ChannelBoard } from "@/components/channel-board";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function ChannelPage() {
  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <PageHeader title="Channel" description="Your published videos and their real audience retention. Gemini watches them so the Director learns what your viewers respond to." />
      <ChannelBoard />
    </div>
  );
}
