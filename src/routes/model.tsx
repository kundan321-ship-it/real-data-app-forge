import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  evaluateTree,
  keyRules,
  trainTree,
  type LabeledSample,
  type WifiLabel,
} from "@/lib/decision-tree";
import type { MeasurementDTO } from "@/lib/wifi.functions";
import { SectionTitle, RouteError, RouteNotFound } from "@/components/ui-bits";
import { AuthRequired } from "@/components/auth-required";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/model")({
  head: () => ({
    meta: [
      { title: "ML Model — College Wi-Fi Analyzer" },
      {
        name: "description",
        content:
          "How the Decision Tree classifier works: features, training data, holdout accuracy and key decision rules.",
      },
      { property: "og:title", content: "ML Model — College Wi-Fi Analyzer" },
      {
        property: "og:description",
        content:
          "How the Decision Tree classifier works: features, training data, holdout accuracy and key decision rules.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ModelPage,
  errorComponent: ({ error, reset }) => <RouteError error={error as Error} reset={reset} />,
  notFoundComponent: RouteNotFound,
});

import { measurementsQueryOptions } from "@/lib/queries";

const featureLabels: Record<string, string> = {
  downloadMbps: "Download speed",
  uploadMbps: "Upload speed",
  pingMs: "Ping (latency)",
  jitterMs: "Jitter",
  packetLossPct: "Packet loss",
};

function fmtPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Clear "date · time" stamp for training-run timestamps. */
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

function ModelPage() {
  const { user, loading } = useAuth();
  const { data = [] } = useQuery({
    ...measurementsQueryOptions(user?.id ?? "signed-out"),
    enabled: Boolean(user),
  });
  const [seed, setSeed] = useState(42);

  const labeled: LabeledSample[] = useMemo(
    () =>
      data
        .filter((row) => row.label !== null)
        .map((row) => ({
          downloadMbps: row.downloadMbps,
          uploadMbps: row.uploadMbps,
          pingMs: row.pingMs,
          jitterMs: row.jitterMs,
          packetLossPct: row.packetLossPct,
          label: row.label as WifiLabel,
        })),
    [data],
  );

  const tree = useMemo(() => trainTree(labeled), [labeled]);
  const evaluation = useMemo(() => evaluateTree(labeled, seed), [labeled, seed]);
  const rules = useMemo(() => keyRules(tree, 3), [tree]);

  const classCounts = useMemo(() => {
    const counts = { Good: 0, Average: 0, Poor: 0 };
    for (const sample of labeled) counts[sample.label]++;
    return counts;
  }, [labeled]);

  const total = labeled.length;

  // Newest labeled measurement = when the current training set was last extended.
  const lastTrainedAt = useMemo(() => {
    let latest: string | null = null;
    for (const row of data) {
      if (row.label !== null && (latest === null || row.createdAt > latest)) latest = row.createdAt;
    }
    return latest;
  }, [data]);

  if (loading) return <p role="status" className="py-12 text-center text-sm text-muted-foreground">Checking your account…</p>;
  if (!user) return <AuthRequired />;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Machine learning</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-foreground">Decision Tree model</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          A CART decision tree (Gini impurity, max depth 6) trained live in your browser on every labeled
          measurement stored in the cloud database. Each labeled run you submit makes the next verdict smarter.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {lastTrainedAt
            ? `Last training run: ${fmtWhen(lastTrainedAt)} · ${total} labeled samples · retrains automatically with every new labeled run.`
            : "No labeled samples yet — the model starts training as soon as a run is labeled."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card px-4 py-3.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Labeled samples</p>
          <p className="mt-1.5 font-mono text-[26px] leading-none font-semibold tabular-nums text-foreground">{total}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Holdout accuracy
          </p>
          <p className="mt-1.5 font-mono text-[26px] leading-none font-semibold tabular-nums text-foreground">
            {total >= 5 ? fmtPct(evaluation.accuracy) : "—"}
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {total >= 5
              ? `${evaluation.correct}/${evaluation.holdoutCount} held-out runs`
              : "Needs at least 5 samples"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Algorithm</p>
          <p className="mt-1.5 font-display text-[17px] font-semibold leading-none text-foreground">Decision Tree</p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">CART · Gini · depth ≤ 6</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Features</p>
          <p className="mt-1.5 font-mono text-[26px] leading-none font-semibold tabular-nums text-foreground">5</p>
        </div>
      </div>

      <section>
        <SectionTitle kicker="Training data">Class distribution</SectionTitle>
        <div className="space-y-2.5">
          {(["Good", "Average", "Poor"] as const).map((label) => (
            <div key={label} className="flex items-center gap-3">
              <span className="w-20 text-sm font-medium text-foreground">{label}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className={
                    label === "Good"
                      ? "h-full rounded-full bg-good"
                      : label === "Average"
                        ? "h-full rounded-full bg-average"
                        : "h-full rounded-full bg-poor"
                  }
                  style={{ width: total ? `${(classCounts[label] / total) * 100}%` : "0%" }}
                />
              </div>
              <span className="w-10 text-right font-mono text-sm tabular-nums text-muted-foreground">
                {classCounts[label]}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle kicker="Explainability">Key decision rules the tree learned</SectionTitle>
        {rules.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            Not enough labeled data yet — rules appear after training.
          </p>
        ) : (
          <ol className="space-y-2">
            {rules.map((rule, i) => (
              <li
                key={`${rule.feature}-${rule.threshold}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3"
              >
                <span className="text-sm text-foreground">
                  <span className="mr-2 font-mono text-muted-foreground">#{i + 1}</span>
                  {featureLabels[rule.feature] ?? rule.feature} split at{" "}
                  <span className="font-mono font-semibold text-primary">{rule.threshold.toFixed(1)}</span>
                </span>
                <span className="text-xs text-muted-foreground">{rule.samples} samples affected</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <SectionTitle kicker="Features">What the model sees</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {Object.entries(featureLabels).map(([key, label]) => (
            <span
              key={key}
              className="rounded-lg border border-border bg-secondary px-3 py-1.5 font-mono text-xs text-foreground"
            >
              {key}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          All five features are measured live in your browser — download and upload throughput, round-trip
          latency, jitter between consecutive probes, and lost probe percentage. No fake or hardcoded values
          are ever used.
        </p>
      </section>

      <section>
        <button
          onClick={() => setSeed((s) => s + 1)}
          disabled={total < 5}
          className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
        >
          Retrain &amp; re-evaluate (new data split)
        </button>
        <p className="mt-2 text-xs text-muted-foreground">
          Re-shuffles the 75/25 train/holdout split so you can see how stable the accuracy is across splits.
        </p>
      </section>
    </div>
  );
}
