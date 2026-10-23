import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  runSpeedTest,
  readConnectionInfo,
  fetchNetworkIdentity,
  type TestStage,
  type SpeedTestResult,
  type ConnectionInfo,
  type NetworkIdentity,
} from "@/lib/net-measure";
import {
  trainTree,
  predictTree,
  ruleBasedLabel,
  type Prediction,
  type WifiLabel,
} from "@/lib/decision-tree";
import { saveMeasurement, type MeasurementDTO } from "@/lib/wifi.functions";
import { measurementsQueryOptions } from "@/lib/queries";
import { MetricCard, SectionTitle, StatusBadge, RouteError, RouteNotFound, WifiMark } from "@/components/ui-bits";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Live Wi-Fi Test — College Wi-Fi Analyzer" },
      {
        name: "description",
        content:
          "Measure your real network speed, ping, jitter and packet loss live, then get an ML performance verdict: Good, Average or Poor.",
      },
      { property: "og:title", content: "Live Wi-Fi Test — College Wi-Fi Analyzer" },
      {
        property: "og:description",
        content:
          "Measure your real network speed, ping, jitter and packet loss live, then get an ML performance verdict: Good, Average or Poor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(measurementsQueryOptions()),
  component: Index,
  errorComponent: ({ error, reset }) => <RouteError error={error as Error} reset={reset} />,
  notFoundComponent: RouteNotFound,
});

type Phase = "idle" | "latency" | "download" | "upload" | "analyzing" | "done" | "error";

const stageOrder: Array<{ key: Phase; label: string }> = [
  { key: "latency", label: "Ping & jitter" },
  { key: "download", label: "Download" },
  { key: "upload", label: "Upload" },
  { key: "analyzing", label: "ML verdict" },
];

function fmt(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

/** Clear "date · time" formatting used everywhere a run is stamped. */
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

function Index() {
  const data = useLoaderData({ from: "/" }) as MeasurementDTO[];
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<Phase>("idle");
  const [metrics, setMetrics] = useState<SpeedTestResult | null>(null);
  const [liveDownload, setLiveDownload] = useState<number | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [conn, setConn] = useState<ConnectionInfo | null>(null);
  const [network, setNetwork] = useState<NetworkIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [relabeled, setRelabeled] = useState(false);
  const runningRef = useRef(false);

  const saveRow = useServerFn(saveMeasurement);
  const saveMutation = useMutation({
    mutationFn: saveRow,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wifi-measurements"] }),
  });

  // Browser Network Information API estimates (hydration-safe).
  useEffect(() => {
    setConn(readConnectionInfo());
  }, []);

  // Train the Decision Tree on all labeled measurements collected so far.
  const labeled = useMemo(
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
  const modelReady = labeled.length >= 10;

  async function startTest() {
    if (runningRef.current) return;
    runningRef.current = true;
    setError(null);
    setMetrics(null);
    setPrediction(null);
    setSavedId(null);
    setRelabeled(false);
    setLiveDownload(null);
    setNetwork(null);
    setPhase("latency");
    // Resolve which network we are testing (ISP/organization of the public IP)
    // while the latency probes run — it is saved with the measurement.
    void fetchNetworkIdentity().then(setNetwork);
    try {
      const result = await runSpeedTest({
        onStage: (stage) => setPhase(stage as Phase),
        onLiveDownload: setLiveDownload,
      });
      setMetrics(result);
      setPhase("analyzing");

      let predicted: Prediction;
      if (modelReady) {
        predicted = predictTree(tree, result);
      } else {
        const label = ruleBasedLabel(result);
        predicted = { label, confidence: 1, distribution: { Good: 0, Average: 0, Poor: 0, [label]: 1 } as Prediction["distribution"] };
      }
      setPrediction(predicted);

      const saved = await saveMutation.mutateAsync({
        data: {
          ...result,
          downlinkEstimateMbps: conn?.downlinkMbps ?? null,
          effectiveType: conn?.effectiveType ?? null,
          networkName: network?.name ?? null,
          predictedLabel: predicted.label,
          source: "auto-test",
        },
      });
      setSavedId(saved.id);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The test failed. Please try again.");
      setPhase("error");
    } finally {
      runningRef.current = false;
    }
  }

  async function relabelAs(label: WifiLabel) {
    if (!metrics || savedId === null || relabeled) return;
    setRelabeled(true);
    try {
      await saveMutation.mutateAsync({
        data: {
          ...metrics,
          downlinkEstimateMbps: conn?.downlinkMbps ?? null,
          effectiveType: conn?.effectiveType ?? null,
          networkName: network?.name ?? null,
          label,
          source: "user-labeled",
        },
      });
    } catch {
      setRelabeled(false);
      setError("Could not save your correction. Try again.");
    }
  }

  const testing = phase === "latency" || phase === "download" || phase === "upload" || phase === "analyzing";
  const busy = testing || phase === "done";

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="pointer-events-none absolute -top-16 right-8 h-48 w-48">
          {testing ? (
            <>
              <span className="animate-radar absolute inset-0 rounded-full border border-primary/40" />
              <span className="animate-radar absolute inset-0 rounded-full border border-primary/25 [animation-delay:0.6s]" />
            </>
          ) : null}
        </div>
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Real-time measurement
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Test your Wi-Fi, get an ML verdict
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              One click measures your actual download, upload, ping, jitter and packet loss — then a
              Decision Tree trained on collected measurements classifies your connection.
            </p>
          </div>
          <div className="shrink-0">
            <button
              onClick={startTest}
              disabled={busy}
              className="inline-flex h-12 items-center gap-2.5 rounded-xl bg-primary px-6 font-display text-[15px] font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="relative flex h-2 w-2">
                {testing ? <span className="animate-signal absolute inset-0 rounded-full bg-primary-foreground" /> : <span className="absolute inset-0 rounded-full bg-primary-foreground" />}
              </span>
              {testing ? "Measuring…" : phase === "done" ? "Run again" : "Start Wi-Fi Test"}
            </button>
            {network ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Testing: <span className="font-medium text-foreground">{network.name}</span>
              </p>
            ) : null}
          </div>
        </div>

        {/* Progress stages */}
        {testing ? (
          <div className="relative mt-6 flex flex-wrap gap-2">
            {stageOrder.map((stage) => {
              const idx = stageOrder.findIndex((s) => s.key === phase);
              const stageIdx = stageOrder.findIndex((s) => s.key === stage.key);
              const state = stageIdx < idx ? "done" : stageIdx === idx ? "active" : "todo";
              return (
                <span
                  key={stage.key}
                  className={
                    state === "active"
                      ? "rounded-lg border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
                      : state === "done"
                        ? "rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground"
                        : "rounded-lg border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground/60"
                  }
                >
                  {state === "active" ? "▸ " : state === "done" ? "✓ " : ""}
                  {stage.label}
                </span>
              );
            })}
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {/* Live metrics */}
      <section>
        <SectionTitle kicker="Live results" key={phase}>Network measurements</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard
            label="Download"
            unit="Mbps"
            value={phase === "download" && liveDownload !== null ? fmt(liveDownload) : metrics ? fmt(metrics.downloadMbps) : null}
            live={phase === "download"}
          />
          <MetricCard label="Upload" unit="Mbps" value={metrics ? fmt(metrics.uploadMbps) : null} live={phase === "upload"} />
          <MetricCard label="Ping" unit="ms" value={metrics ? fmt(metrics.pingMs) : null} live={phase === "latency"} />
          <MetricCard label="Jitter" unit="ms" value={metrics ? fmt(metrics.jitterMs) : null} live={phase === "latency"} />
          <MetricCard label="Packet loss" unit="%" value={metrics ? fmt(metrics.packetLossPct) : null} live={phase === "latency"} />
          <MetricCard
            label="Browser estimate"
            unit="Mbps"
            value={conn?.downlinkMbps != null ? fmt(conn.downlinkMbps) : null}
            hint={conn?.effectiveType ? `~${conn.effectiveType} (browser-reported)` : undefined}
          />
        </div>
      </section>

      {/* Verdict */}
      {(testing || metrics) && (
        <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <SectionTitle kicker="ML prediction">Wi-Fi performance</SectionTitle>
          <p className="mb-4 text-xs text-muted-foreground">
            Network:{" "}
            <span className="font-medium text-foreground">
              {network ? network.name : "detecting…"}
            </span>
            {network?.location ? <span className="ml-1">· {network.location}</span> : null}
          </p>
          {prediction ? (
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-5">
                <div
                  className={
                    prediction.label === "Good"
                      ? "flex h-24 w-24 items-center justify-center rounded-full border-2 border-good/50 bg-good/10"
                      : prediction.label === "Average"
                        ? "flex h-24 w-24 items-center justify-center rounded-full border-2 border-average/50 bg-average/10"
                        : "flex h-24 w-24 items-center justify-center rounded-full border-2 border-poor/50 bg-poor/10"
                  }
                >
                  <WifiMark
                    className={
                      prediction.label === "Good"
                        ? "h-10 w-10 text-good"
                        : prediction.label === "Average"
                          ? "h-10 w-10 text-average"
                          : "h-10 w-10 text-poor"
                    }
                  />
                </div>
                <div>
                  <p
                    className={
                      prediction.label === "Good"
                        ? "font-display text-4xl font-bold text-good"
                        : prediction.label === "Average"
                          ? "font-display text-4xl font-bold text-average"
                          : "font-display text-4xl font-bold text-poor"
                    }
                  >
                    {prediction.label}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {modelReady
                      ? `Decision Tree verdict · ${Math.round(prediction.confidence * 100)}% leaf confidence`
                      : `Rule-based verdict (training on real data — ${labeled.length} labeled samples so far)`}
                  </p>
                </div>
              </div>
              {savedId ? (
                <div className="rounded-xl border border-border bg-secondary/50 p-4">
                  <p className="text-xs font-medium text-muted-foreground">Saved to history. Does the verdict feel right?</p>
                  <div className="mt-2 flex gap-2">
                    {(["Good", "Average", "Poor"] as WifiLabel[]).map((label) => (
                      <button
                        key={label}
                        onClick={() => relabelAs(label)}
                        disabled={relabeled}
                        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {relabeled ? (
                    <p className="mt-2 text-xs text-primary">Thanks — added as a labeled sample for the next training run.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="animate-signal h-2 w-2 rounded-full bg-primary" />
              Measuring your network…
            </div>
          )}
        </section>
      )}

      {/* Recent runs */}
      <section>
        <SectionTitle kicker="Collected data">
          Recent runs <span className="text-sm font-normal text-muted-foreground">({data.length} total)</span>
        </SectionTitle>
        {data.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            No measurements yet — run your first test above.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.slice(0, 6).map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
              >
                <div>
                  <p className="font-mono text-sm tabular-nums text-foreground">
                    {fmt(row.downloadMbps)} <span className="text-muted-foreground">↓</span> · {fmt(row.uploadMbps)}{" "}
                    <span className="text-muted-foreground">↑</span> · {fmt(row.pingMs, 0)} <span className="text-muted-foreground">ms</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {fmtWhen(row.createdAt)}
                    {row.networkName ? ` · ${row.networkName}` : ""}
                    {row.label ? ` · labeled ${row.label.toLowerCase()}` : ""}
                  </p>
                </div>
                {row.predictedLabel ? <StatusBadge label={row.predictedLabel} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
