"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Button } from "./ui";

/** Starts a project seeded from the channel profile and opens its directions. */
export function NextVideoButton({ channelName }: { channelName?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    const idea = channelName
      ? `My next video for ${channelName}: something my audience would value that I haven't made before.`
      : "My next video: something my audience would value that I haven't made before.";
    const res = await api<{ redirect: string }>("/api/start", { json: { text: idea, kind: "idea", title: "Next video" } });
    router.push(res.redirect);
  };
  return (
    <Button variant="primary" onClick={start} busy={busy}>
      Suggest next videos
    </Button>
  );
}
