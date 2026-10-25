"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { formatClock } from "@/lib/edit/export";
import { Card } from "../ui";

interface Callout {
  atSeconds: number;
  label: string;
  reason: string;
  raisedBy: string[];
}

const AVATAR: Record<string, string> = { Maya: "bg-sky-600", Dev: "bg-orange-600", Priya: "bg-emerald-700", Sam: "bg-violet-600" };
const CARDS_H = 46; // percent of the figure height taken by the callout row
const CHART_TOP = 56;
const CHART_BOTTOM = 96;
const CHART_LEFT = 4;
const CHART_RIGHT = 98;

/**
 * The video's real retention curve with the review panel's explanation of
 * each drop: a frame, what happened, why viewers left, and who flagged it.
 */
export function WhyChart({ videoId, ratios, values, durationSeconds }: { videoId: string; ratios: number[]; values: number[]; durationSeconds: number }) {
  const [callouts, setCallouts] = useState<Callout[] | null>(null);
  useEffect(() => {
    let live = true;
    api<{ callouts: { callouts: Callout[] } | null }>(`/api/reviews/callouts?target=${videoId}`).then((r) => live && setCallouts(r.callouts?.callouts ?? []));
    return () => {
      live = false;
    };
  }, [videoId]);
  if (!callouts?.length) return null;

  const items = [...callouts].sort((a, b) => a.atSeconds - b.atSeconds).slice(0, 4);
  const max = Math.max(1, ...values);
  const x = (r: number) => CHART_LEFT + r * (CHART_RIGHT - CHART_LEFT);
  const y = (v: number) => CHART_BOTTOM - (v / max) * (CHART_BOTTOM - CHART_TOP);
  const path = values.map((v, i) => `${i ? "L" : "M"}${x(ratios[i]).toFixed(2)},${y(v).toFixed(2)}`).join("");
  const valueAt = (t: number) => {
    const r = t / durationSeconds;
    const i = Math.max(0, ratios.findIndex((q) => q >= r));
    return values[i] ?? values.at(-1)!;
  };
  const colX = (i: number) => (100 / items.length) * (i + 0.5);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Why viewers left</h2>
        <p className="text-sm text-muted">Your real retention, explained by 4 Managed Agents on Gemini 4 Argon</p>
      </div>
      <div className="relative mt-4 aspect-[2.6/1] w-full">
        <div className="absolute inset-x-0 top-0 grid gap-3" style={{ height: `${CARDS_H}%`, gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((c, i) => (
            <div key={i} className="why-callout flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-card shadow-sm" style={{ animationDelay: `${0.3 + i * 0.45}s` }}>
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/frames/${videoId}?t=${c.atSeconds.toFixed(1)}`} alt="" className="aspect-[16/7] w-full object-cover" />
                <span className="absolute top-1.5 left-1.5 rounded bg-del-ink px-1.5 py-0.5 font-mono text-[11px] font-medium text-white">{formatClock(c.atSeconds)}</span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col p-2.5">
                <p className="text-[13px] leading-tight font-semibold">{c.label}</p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted">{c.reason}</p>
                <div className="mt-auto flex items-center gap-1.5 pt-1.5">
                  <div className="flex -space-x-1.5">
                    {c.raisedBy.map((n) => (
                      <span key={n} title={n} className={`flex size-4 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-2 ring-card ${AVATAR[n] ?? "bg-stone-500"}`}>
                        {n[0]}
                      </span>
                    ))}
                  </div>
                  <span className="text-[10px] text-faint">{c.raisedBy.length === 4 ? "all 4 agree" : c.raisedBy.join(", ")}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          {[0.25, 0.5, 0.75, 1].map((g) => (
            <line key={g} x1={CHART_LEFT} x2={CHART_RIGHT} y1={y(g * max)} y2={y(g * max)} stroke="#ecebe7" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={path} fill="none" stroke="#2a78d6" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {items.map((c, i) => {
            const px = x(c.atSeconds / durationSeconds);
            const py = y(valueAt(c.atSeconds));
            return (
              <g key={i} className="why-link" style={{ animationDelay: `${0.3 + i * 0.45}s` }}>
                <line x1={colX(i)} y1={CARDS_H + 0.5} x2={px} y2={py} stroke="#9b1c1c" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
        </svg>
        {items.map((c, i) => (
          <span
            key={i}
            className="why-dot absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-del-ink shadow"
            style={{ left: `${x(c.atSeconds / durationSeconds)}%`, top: `${y(valueAt(c.atSeconds))}%`, animationDelay: `${0.3 + i * 0.45}s` }}
          />
        ))}
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <span key={g} className="absolute -translate-y-1/2 font-mono text-[10px] text-faint" style={{ left: 0, top: `${y(g * max)}%` }}>
            {Math.round(g * max * 100)}%
          </span>
        ))}
        <span className="absolute text-[10px] text-muted" style={{ left: `${CHART_LEFT}%`, top: `${CHART_TOP - 3}%` }}>
          viewers still watching
        </span>
        <div className="absolute inset-x-0 bottom-0 flex justify-between px-[4%] font-mono text-[10px] text-faint" style={{ transform: "translateY(110%)" }}>
          <span>0:00</span>
          <span>{formatClock(Math.round(durationSeconds / 2))}</span>
          <span>{formatClock(Math.round(durationSeconds))}</span>
        </div>
      </div>
    </Card>
  );
}
