import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink/85 disabled:bg-ink/40",
  secondary: "border border-line bg-card text-ink hover:border-faint disabled:text-faint",
  ghost: "text-muted hover:text-ink hover:bg-paper disabled:text-faint",
};

export function Button({
  variant = "secondary",
  busy,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} aria-hidden />;
}

export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`rounded-lg border border-line bg-card ${className}`}>
      {children}
    </div>
  );
}

const LABEL_STYLES: Record<string, string> = {
  observed: "bg-sky-50 text-sky-800 ring-sky-200",
  hypothesis: "bg-violet-50 text-violet-800 ring-violet-200",
  historically_associated: "bg-amber-50 text-amber-800 ring-amber-200",
  experimentally_supported: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  inconclusive: "bg-stone-100 text-stone-700 ring-stone-200",
  observation: "bg-sky-50 text-sky-800 ring-sky-200",
  outdated: "bg-stone-100 text-stone-500 ring-stone-200",
  direct: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  partial: "bg-amber-50 text-amber-800 ring-amber-200",
  suggested: "bg-stone-100 text-stone-700 ring-stone-200",
  offline: "bg-amber-50 text-amber-800 ring-amber-200",
  explore: "bg-violet-50 text-violet-800 ring-violet-200",
  optimize: "bg-sky-50 text-sky-800 ring-sky-200",
};

const LABEL_TEXT: Record<string, string> = {
  historically_associated: "Historically associated",
  experimentally_supported: "Experimentally supported",
  direct: "Playable",
  partial: "Needs your input",
  suggested: "Plan only",
};

export function Badge({ kind, children }: { kind: string; children?: ReactNode }) {
  const text = children ?? LABEL_TEXT[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1).replace(/_/g, " ");
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${LABEL_STYLES[kind] ?? "bg-stone-100 text-stone-700 ring-stone-200"}`}>{text}</span>;
}

export function ModelTag({ model }: { model?: string | null }) {
  if (!model) return null;
  if (model === "offline") return <Badge kind="offline">Offline heuristics</Badge>;
  return <span className="font-mono text-[11px] text-faint">{model}</span>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions}
    </header>
  );
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="rounded-md bg-del px-3 py-2 text-sm text-del-ink">{error}</p>;
}
