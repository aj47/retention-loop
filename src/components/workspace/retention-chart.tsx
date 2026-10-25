"use client";

import { useState } from "react";
import type { RetentionAnalysis } from "@/lib/analytics/retention";
import { formatClock } from "@/lib/edit/export";

const W = 720;
const H = 240;
const M = { top: 12, right: 64, bottom: 28, left: 40 };
const OBSERVED = "#2a78d6";
const EXPECTED = "#8a8580";

/**
 * Observed (smoothed) watch ratio against the expected curve, with flagged
 * intervals shaded and numbered. Hover shows both values at a position.
 */
export function RetentionChart({ analysis, durationSeconds, highlight }: { analysis: RetentionAnalysis; durationSeconds: number; highlight?: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const { ratios, smoothed, expected } = analysis;
  const maxY = Math.max(1, ...smoothed, ...expected) * 1.05;
  const x = (r: number) => M.left + r * (W - M.left - M.right);
  const y = (v: number) => M.top + (1 - v / maxY) * (H - M.top - M.bottom);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(ratios[i]).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const yTicks = [0, 0.25, 0.5, 0.75, 1].filter((t) => t <= maxY);
  const xTicks = [0, 0.25, 0.5, 0.75, 1];
  const last = ratios.length - 1;

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const r = ((e.clientX - box.left) / box.width) * 1;
    let best = 0;
    ratios.forEach((v, i) => Math.abs(v - r) < Math.abs(ratios[best] - r) && (best = i));
    setHover(best);
  };

  return (
    <figure>
      <div className="mb-2 flex items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <svg width="18" height="4">
            <line x1="0" y1="2" x2="18" y2="2" stroke={OBSERVED} strokeWidth="2" />
          </svg>
          Observed (smoothed)
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="18" height="4">
            <line x1="0" y1="2" x2="18" y2="2" stroke={EXPECTED} strokeWidth="2" strokeDasharray="4 3" />
          </svg>
          Expected ({analysis.baselineSource === "comparable_median" ? "comparable videos" : "fitted decay"})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-stone-200" />
          Flagged interval
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Audience retention compared with expected retention">
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="#ecebe7" />
            <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[#8a8580] text-[10px]">
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={H - 8} textAnchor="middle" className="fill-[#8a8580] text-[10px]">
            {formatClock(t * durationSeconds)}
          </text>
        ))}
        {analysis.anomalies.map((a, i) => (
          <g key={i}>
            <rect
              x={x(a.startRatio)}
              y={M.top}
              width={Math.max(3, x(a.endRatio) - x(a.startRatio))}
              height={H - M.top - M.bottom}
              rx="2"
              className={highlight === i ? "fill-stone-300" : "fill-stone-200/70"}
            />
            <text x={x(a.startRatio) + 3} y={M.top + 10} className="fill-[#57534e] text-[10px] font-medium">
              {i + 1}
            </text>
          </g>
        ))}
        <path d={path(expected)} fill="none" stroke={EXPECTED} strokeWidth="2" strokeDasharray="5 4" />
        <path d={path(smoothed)} fill="none" stroke={OBSERVED} strokeWidth="2" strokeLinejoin="round" />
        <text x={x(1) + 6} y={y(smoothed[last])} dy="0.32em" className="fill-[#1c1b19] text-[10px]">
          {Math.round(smoothed[last] * 100)}%
        </text>
        {hover != null && (
          <g pointerEvents="none">
            <line x1={x(ratios[hover])} x2={x(ratios[hover])} y1={M.top} y2={H - M.bottom} stroke="#a19d95" />
            <circle cx={x(ratios[hover])} cy={y(smoothed[hover])} r="4" fill={OBSERVED} stroke="#fff" strokeWidth="2" />
            <circle cx={x(ratios[hover])} cy={y(expected[hover])} r="4" fill={EXPECTED} stroke="#fff" strokeWidth="2" />
          </g>
        )}
        <rect x={M.left} y={M.top} width={W - M.left - M.right} height={H - M.top - M.bottom} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      <div className="h-5 text-xs text-ink tabular-nums">
        {hover != null && (
          <span>
            {formatClock(ratios[hover] * durationSeconds)} · observed {(smoothed[hover] * 100).toFixed(1)}% · expected {(expected[hover] * 100).toFixed(1)}%
          </span>
        )}
      </div>
    </figure>
  );
}
