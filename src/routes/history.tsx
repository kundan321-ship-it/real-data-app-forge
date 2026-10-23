import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MeasurementDTO } from "@/lib/wifi.functions";
import { SectionTitle, RouteError, RouteNotFound, StatusBadge } from "@/components/ui-bits";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Measurement History — College Wi-Fi Analyzer" },
      {
        name: "description",
        content: "Every real Wi-Fi measurement collected by the analyzer, with trends and class statistics.",
      },
      { property: "og:title", content: "Measurement History — College Wi-Fi Analyzer" },
      {
        property: "og:description",
        content: "Every real Wi-Fi measurement collected by the analyzer, with trends and class statistics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(measurementsQueryOptionsForHistory()),
  component: HistoryPage,
  errorComponent: ({ error, reset }) => <RouteError error={error as Error} reset={reset} />,
  notFoundComponent: RouteNotFound,
});

import { measurementsQueryOptions } from "@/lib/queries";
function measurementsQueryOptionsForHistory() {
  return measurementsQueryOptions();
}

function fmt(n: number, digits = 1): string {
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

/** Clear "date · time" stamp for every saved run. */
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

function StatsRow({ data }: { data: MeasurementDTO[] }) {
  const count = data.length;
  const avgDownload = count ? data.reduce((s, r) => s + r.downloadMbps, 0) / count : 0;
  const avgPing = count ? data.reduce((s, r) => s + r.pingMs, 0) / count : 0;
  const best = count ? Math.max(...data.map((r) => r.downloadMbps)) : 0;
  const worst = count ? Math.min(...data.map((r) => r.downloadMbps)) : 0;

  const cards = [
    { label: "Total runs", value: String(count), unit: "" },
    { label: "Avg download", value: fmt(avgDownload), unit: "Mbps" },
    { label: "Avg ping", value: fmt(avgPing, 0), unit: "ms" },
    { label: "Best / worst ↓", value: `${fmt(best, 0)} / ${fmt(worst, 0)}`, unit: "Mbps" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-border bg-card px-4 py-3.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{card.label}</p>
          <p className="mt-1.5 font-mono text-[26px] leading-none font-semibold tabular-nums text-foreground">
            {card.value}
            {card.unit ? <span className="ml-1.5 text-[13px] font-medium text-muted-foreground">{card.unit}</span> : null}
          </p>
        </div>
      ))}
    </div>
  );
}

function DownloadTrend({ data }: { data: MeasurementDTO[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <div className="h-64 rounded-xl border border-border bg-card" />;
  }
  const series = [...data]
    .reverse()
    .slice(-40)
    .map((row, i) => ({
      idx: i + 1,
      when: fmtWhen(row.createdAt),
      download: Number(row.downloadMbps.toFixed(1)),
      ping: Number(row.pingMs.toFixed(0)),
    }));
  return (
    <div className="h-64 rounded-xl border border-border bg-card p-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 12, right: 16, bottom: 4, left: -12 }}>
          <CartesianGrid stroke="oklch(1 0 0 / 0.07)" vertical={false} />
          <XAxis dataKey="idx" tick={{ fontSize: 11, fill: "oklch(0.68 0.02 262)" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "oklch(0.68 0.02 262)" }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              background: "oklch(0.21 0.03 262)",
              border: "1px solid oklch(1 0 0 / 0.12)",
              borderRadius: 10,
              fontSize: 12,
            }}
            labelFormatter={(label, payload) => {
              const point = payload?.[0]?.payload as { when?: string } | undefined;
              return point?.when ? `Run #${label} · ${point.when}` : `Run #${label}`;
            }}
          />
          <Line type="monotone" dataKey="download" name="Download (Mbps)" stroke="oklch(0.84 0.18 160)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="ping" name="Ping (ms)" stroke="oklch(0.76 0.13 210)" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function HistoryPage() {
  const data = useLoaderData({ from: "/history" }) as MeasurementDTO[];

  const labeledCounts = useMemo(() => {
    const counts = { Good: 0, Average: 0, Poor: 0 };
    for (const row of data) {
      const label = row.label ?? row.predictedLabel;
      if (label === "Good" || label === "Average" || label === "Poor") counts[label]++;
    }
    return counts;
  }, [data]);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Collected data</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-foreground">Measurement history</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every run below is a real network measurement stored in the cloud database.
        </p>
      </div>

      <StatsRow data={data} />

      <section>
        <SectionTitle kicker="Class distribution">Verdicts so far</SectionTitle>
        <div className="flex flex-wrap gap-3">
          {(["Good", "Average", "Poor"] as const).map((label) => (
            <div key={label} className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5">
              <StatusBadge label={label} />
              <span className="font-mono text-lg font-semibold tabular-nums text-foreground">{labeledCounts[label]}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle kicker="Trend">Download &amp; ping over time</SectionTitle>
        <DownloadTrend data={data} />
      </section>

      <section>
        <SectionTitle kicker="Raw log">Latest measurements</SectionTitle>
        {data.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            Nothing logged yet — run a test on the Live Test page.
          </p>
        ) : (
          <div className="scroll-thin overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Network</th>
                  <th className="px-4 py-3 font-medium">Download</th>
                  <th className="px-4 py-3 font-medium">Upload</th>
                  <th className="px-4 py-3 font-medium">Ping</th>
                  <th className="px-4 py-3 font-medium">Jitter</th>
                  <th className="px-4 py-3 font-medium">Loss</th>
                  <th className="px-4 py-3 font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {data.slice(0, 50).map((row) => (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5 font-sans text-xs text-muted-foreground">
                      {fmtWhen(row.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-foreground">{row.networkName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-foreground">{fmt(row.downloadMbps)}</td>
                    <td className="px-4 py-2.5 text-foreground">{fmt(row.uploadMbps)}</td>
                    <td className="px-4 py-2.5 text-foreground">{fmt(row.pingMs, 0)}</td>
                    <td className="px-4 py-2.5 text-foreground">{fmt(row.jitterMs)}</td>
                    <td className="px-4 py-2.5 text-foreground">{fmt(row.packetLossPct)}</td>
                    <td className="px-4 py-2.5">
                      {row.label ? (
                        <StatusBadge label={row.label} />
                      ) : row.predictedLabel ? (
                        <StatusBadge label={row.predictedLabel} className="opacity-70" />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
