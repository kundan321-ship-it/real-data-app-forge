import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { WifiLabel } from "@/lib/decision-tree";

export function WifiMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M2.5 9.5a15 15 0 0 1 19 0" />
      <path d="M5.5 13a10.5 10.5 0 0 1 13 0" />
      <path d="M8.5 16.5a6 6 0 0 1 7 0" />
      <circle cx="12" cy="20" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MetricCard({
  label,
  value,
  unit,
  hint,
  live,
}: {
  label: string;
  value: string | number | null;
  unit: string;
  hint?: string | undefined;
  live?: boolean | undefined;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        {live ? <span className="animate-signal h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" /> : null}
      </div>
      <p className="mt-1.5 font-mono text-[26px] leading-none font-semibold tabular-nums text-foreground">
        {value ?? "—"}
        <span className="ml-1.5 text-[13px] font-medium text-muted-foreground">{unit}</span>
      </p>
      {hint ? <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const labelStyles: Record<WifiLabel, string> = {
  Good: "border-good/40 bg-good/10 text-good",
  Average: "border-average/40 bg-average/10 text-average",
  Poor: "border-poor/40 bg-poor/10 text-poor",
};

export function StatusBadge({ label, className }: { label: WifiLabel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold",
        labelStyles[label],
        className,
      )}
    >
      {label}
    </span>
  );
}

export function SectionTitle({ children, kicker }: { children: ReactNode; kicker?: string }) {
  return (
    <div className="mb-4">
      {kicker ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{kicker}</p>
      ) : null}
      <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-foreground">{children}</h2>
    </div>
  );
}

export function RouteError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
      <p className="font-display text-lg font-semibold text-foreground">This view didn't load</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Something went wrong on our end."}
      </p>
      <button
        onClick={reset}
        className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  );
}

export function RouteNotFound() {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
      <p className="font-display text-lg font-semibold text-foreground">Not found</p>
      <p className="mt-2 text-sm text-muted-foreground">That page doesn't exist.</p>
    </div>
  );
}
