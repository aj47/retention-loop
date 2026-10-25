import { ChannelForm } from "@/components/channel-form";
import { Card, PageHeader } from "@/components/ui";
import { DIRECTOR_MODEL, directorMode, FLASH } from "@/lib/director/model";
import { transcriber } from "@/lib/media/ffmpeg";
import { getChannel } from "@/lib/memory/lessons";
import { connectedChannelId } from "@/lib/youtube/client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const channel = await getChannel();
  const mode = directorMode();
  const asr = transcriber();
  const channelId = connectedChannelId();
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-8 py-8">
      <PageHeader title="Settings" />
      <section>
        <h2 className="mb-2 font-semibold">Your channel</h2>
        <p className="mb-3 text-sm text-muted">The Director reads this on every request so you don&apos;t have to explain your channel again.</p>
        <ChannelForm initial={channel ? JSON.parse(JSON.stringify(channel)) : null} />
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Connections</h2>
        <Card className="divide-y divide-line text-sm">
          <Row
            label="AI Director"
            value={mode === "gemini" ? `Gemini 4 Argon (${DIRECTOR_MODEL})` : "Offline heuristics"}
            hint={
              mode === "gemini"
                ? `Companions: ${FLASH} for parallel per-video analysis, selection rewrites and shot plans.`
                : "Set GEMINI_API_KEY in .env.local and restart to enable the Director."
            }
          />
          <Row label="Transcription" value={asr ? `Local ${asr.kind} (${asr.model})` : "Off"} hint="Runs on this machine. Set RL_WHISPER_CPP_MODEL to a ggml model to use whisper.cpp instead of Python Whisper." />
          <Row
            label="YouTube"
            value={channelId ? `Connected (read-only) · ${channelId}` : "Not connected"}
            hint="Read-only YouTube Analytics (yt-analytics.readonly). Client and token live in YT_ANALYTICS_CONFIG_DIR, outside the repo. The app never writes to YouTube."
          />
        </Card>
      </section>
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-4 py-3">
      <div className="flex justify-between gap-4">
        <span className="text-muted">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  );
}
