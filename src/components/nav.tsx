"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Director" },
  { href: "/work", label: "My Work" },
  { href: "/channel", label: "Channel" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/memory", label: "Channel Memory" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ mode, model }: { mode: "gemini" | "offline"; model: string }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" || path.startsWith("/projects") : path.startsWith(href));
  return (
    <nav className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-line bg-card px-3 py-5 max-md:hidden">
      <Link href="/" className="mb-6 px-2 text-[15px] font-semibold tracking-tight">
        Retention<span className="text-accent">Loop</span>
      </Link>
      <ul className="space-y-0.5">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className={`block rounded-md px-2 py-1.5 text-sm ${active(l.href) ? "bg-paper font-medium text-ink" : "text-muted hover:text-ink"}`}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-auto px-2 text-xs text-muted">
        {mode === "gemini" ? (
          <span title="Lead model">
            <span className="mr-1.5 inline-block size-1.5 rounded-full bg-emerald-500 align-middle" />
            Gemini 4 Argon
            <span className="block pl-3 font-mono text-[10px] text-faint">{model}</span>
          </span>
        ) : (
          <Link href="/settings" className="hover:text-ink">
            <span className="mr-1.5 inline-block size-1.5 rounded-full bg-amber-500 align-middle" />
            Offline heuristics
          </Link>
        )}
      </div>
    </nav>
  );
}
