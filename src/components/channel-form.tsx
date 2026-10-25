"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { ChannelIdentity } from "@/lib/db/schema";
import { Button, Card } from "./ui";

const FIELDS: { key: keyof Omit<ChannelIdentity, "preferences">; label: string; placeholder: string }[] = [
  { key: "subject", label: "What it's about", placeholder: "AI coding tools, hands-on comparisons" },
  { key: "audience", label: "Who watches", placeholder: "Working developers trying new tools" },
  { key: "goals", label: "Your goals", placeholder: "Grow watch time on tutorials; fewer, better videos" },
  { key: "tone", label: "Tone and style", placeholder: "Direct, technical, no hype" },
  { key: "constraints", label: "Production constraints", placeholder: "Solo creator, screen recording + face cam" },
];

export function ChannelForm({ initial }: { initial: { name: string; identity: ChannelIdentity } | null }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [identity, setIdentity] = useState<ChannelIdentity>(initial?.identity ?? {});
  const [prefs, setPrefs] = useState((initial?.identity.preferences ?? []).join("\n"));
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    await api("/api/channel", {
      method: "PUT",
      json: { name, identity: { ...identity, preferences: prefs.split("\n").map((p) => p.trim()).filter(Boolean) } },
    });
    setBusy(false);
    setSaved(true);
  };

  return (
    <Card className="space-y-3 p-4">
      <label className="block text-sm">
        <span className="text-xs text-muted">Channel name</span>
        <input value={name} onChange={(e) => (setName(e.target.value), setSaved(false))} className="mt-1 w-full rounded-md border border-line px-2 py-1.5 outline-none" />
      </label>
      {FIELDS.map((f) => (
        <label key={f.key} className="block text-sm">
          <span className="text-xs text-muted">{f.label}</span>
          <input
            value={identity[f.key] ?? ""}
            onChange={(e) => (setIdentity({ ...identity, [f.key]: e.target.value }), setSaved(false))}
            placeholder={f.placeholder}
            className="mt-1 w-full rounded-md border border-line px-2 py-1.5 outline-none placeholder:text-faint"
          />
        </label>
      ))}
      <label className="block text-sm">
        <span className="text-xs text-muted">Editorial preferences (one per line)</span>
        <textarea
          value={prefs}
          onChange={(e) => (setPrefs(e.target.value), setSaved(false))}
          rows={3}
          placeholder={"Prefers shorter openings\nNo exaggerated clickbait"}
          className="mt-1 block w-full rounded-md border border-line px-2 py-1.5 outline-none placeholder:text-faint"
        />
      </label>
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={save} busy={busy} disabled={!name.trim()}>
          Save
        </Button>
        {saved && <span className="text-sm text-add-ink">Saved</span>}
      </div>
    </Card>
  );
}
