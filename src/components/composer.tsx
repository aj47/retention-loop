"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { interpret, type InputKind } from "@/lib/director/interpret";
import { api } from "@/lib/client";
import { Button, ErrorNote } from "./ui";

const KIND_LABEL: Record<InputKind, string> = { idea: "Idea", script: "Script", next: "What to make next", video: "Video" };

export function uploadWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type || "video/mp4");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      const data = JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 400) reject(new Error(data.error ?? `Upload failed (${xhr.status})`));
      else resolve(data);
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });
}

export function Composer({ initialText = "" }: { initialText?: string }) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [file, setFile] = useState<File | null>(null);
  const [override, setOverride] = useState<InputKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const guess = useMemo(() => (text.trim() ? interpret(text) : null), [text]);
  const kind: InputKind | null = file ? "video" : (override ?? guess?.kind ?? null);

  async function takeFile(f: File) {
    setError(null);
    if (/^(video|audio)\//.test(f.type)) {
      setFile(f);
      return;
    }
    if (/\.(txt|md|markdown|fountain)$/i.test(f.name) || f.type.startsWith("text/")) {
      setText(await f.text());
      setOverride("script");
      return;
    }
    setError("Drop a video, audio file, or a text script.");
  }

  async function submit() {
    if (!kind) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ projectId?: string; redirect: string }>("/api/start", {
        json: { text, kind, title: file ? file.name.replace(/\.[^.]+$/, "") : undefined },
      });
      if (file && res.projectId) {
        setProgress(0);
        await uploadWithProgress(`/api/projects/${res.projectId}/assets?filename=${encodeURIComponent(file.name)}`, file, setProgress);
      }
      router.push(res.redirect);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div
      className={`rounded-xl border bg-card shadow-sm transition-colors ${dragging ? "border-accent" : "border-line"}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) void takeFile(f);
      }}
    >
      {file ? (
        <div className="flex items-center justify-between gap-3 px-5 py-6">
          <div>
            <p className="text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted">
              {(file.size / 1e6).toFixed(1)} MB · {progress != null ? `Uploading ${progress}%` : "Ready to upload"}
            </p>
          </div>
          <Button variant="ghost" onClick={() => setFile(null)} disabled={busy}>
            Remove
          </Button>
        </div>
      ) : (
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOverride(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          }}
          rows={text.split("\n").length > 6 ? 14 : 5}
          placeholder="An idea, a draft script, or drop a rough cut…"
          className="block w-full resize-none rounded-t-xl bg-transparent px-5 pt-4 pb-2 text-[15px] leading-relaxed outline-none placeholder:text-faint"
          autoFocus
        />
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        <input
          ref={fileInput}
          type="file"
          accept="video/*,audio/*,.txt,.md"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && void takeFile(e.target.files[0])}
        />
        <Button variant="ghost" onClick={() => fileInput.current?.click()} disabled={busy}>
          Upload file
        </Button>
        {kind && !file && (
          <div className="flex items-center gap-1 text-xs text-muted">
            <span>Treat as</span>
            {(["idea", "script", "next"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setOverride(k)}
                className={`rounded px-1.5 py-0.5 ${kind === k ? "bg-accent-soft font-medium text-accent" : "hover:text-ink"}`}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
            {guess && !override && <span className="ml-1 text-faint">· {guess.explanation}</span>}
          </div>
        )}
        <Button variant="primary" className="ml-auto" onClick={submit} busy={busy} disabled={!kind}>
          {kind === "video" ? "Find a better cut" : kind === "script" ? "Improve this script" : kind === "next" ? "Show opportunities" : "Find the angle"}
        </Button>
      </div>
      {error && (
        <div className="px-3 pb-3">
          <ErrorNote error={error} />
        </div>
      )}
    </div>
  );
}
