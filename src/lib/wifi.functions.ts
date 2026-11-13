import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WifiLabel = "Good" | "Average" | "Poor";

export interface MeasurementDTO {
  id: string;
  createdAt: string;
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  jitterMs: number;
  packetLossPct: number;
  downlinkEstimateMbps: number | null;
  effectiveType: string | null;
  networkName: string | null;
  wifiSsid: string | null;
  label: WifiLabel | null;
  predictedLabel: WifiLabel | null;
  source: string;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toLabel(value: unknown): WifiLabel | null {
  return value === "Good" || value === "Average" || value === "Poor" ? value : null;
}

type MeasurementRow = Record<string, unknown>;

function mapRow(row: MeasurementRow): MeasurementDTO {
  return {
    id: String(row["id"]),
    createdAt: String(row["created_at"]),
    downloadMbps: toNumber(row["download_mbps"]) ?? 0,
    uploadMbps: toNumber(row["upload_mbps"]) ?? 0,
    pingMs: toNumber(row["ping_ms"]) ?? 0,
    jitterMs: toNumber(row["jitter_ms"]) ?? 0,
    packetLossPct: toNumber(row["packet_loss_pct"]) ?? 0,
    downlinkEstimateMbps: toNumber(row["downlink_estimate_mbps"]),
    effectiveType: (row["effective_type"] as string | null) ?? null,
    networkName: (row["network_name"] as string | null) ?? null,
    wifiSsid: (row["wifi_ssid"] as string | null) ?? null,
    label: toLabel(row["label"]),
    predictedLabel: toLabel(row["predicted_label"]),
    source: String(row["source"] ?? "browser"),
  };
}

/** Each account can only read its own measurements; RLS enforces ownership. */
export const getMeasurements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
  const { supabase } = context;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("wifi_measurements")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data as MeasurementRow[]).map(mapRow);
});

const labelSchema = z.enum(["Good", "Average", "Poor"]);

const saveInput = z.object({
  downloadMbps: z.number().min(0).max(2000),
  uploadMbps: z.number().min(0).max(2000),
  pingMs: z.number().min(0).max(60000),
  jitterMs: z.number().min(0).max(60000),
  packetLossPct: z.number().min(0).max(100),
  downlinkEstimateMbps: z.number().min(0).max(2000).nullable().optional(),
  effectiveType: z.string().max(20).nullable().optional(),
  networkName: z.string().max(160).nullable().optional(),
  wifiSsid: z.string().max(60).nullable().optional(),
  label: labelSchema.nullable().optional(),
  predictedLabel: labelSchema.nullable().optional(),
  source: z.string().max(40).optional(),
});

/** Max saved runs accepted per minute across the whole app (rate limiting).
 * The history page reads at most a few hundred rows per 7 days, so this only
 * trips when something spams the endpoint. */
const MAX_SAVES_PER_MINUTE = 60;

/** Persist a measurement for the authenticated account (validation + rate limit apply). */
export const saveMeasurement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Count only this account's recent writes; RLS keeps the count private too.
    const { count } = await supabase
      .from("wifi_measurements")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", new Date(Date.now() - 60_000).toISOString());
    if ((count ?? 0) >= MAX_SAVES_PER_MINUTE) {
      throw new Error("Too many runs saved in the last minute — please wait a moment and try again.");
    }
    const { data: inserted, error } = await supabase
      .from("wifi_measurements")
      .insert({
        user_id: userId,
        download_mbps: data.downloadMbps,
        upload_mbps: data.uploadMbps,
        ping_ms: data.pingMs,
        jitter_ms: data.jitterMs,
        packet_loss_pct: data.packetLossPct,
        downlink_estimate_mbps: data.downlinkEstimateMbps ?? null,
        effective_type: data.effectiveType ?? null,
        network_name: data.networkName ?? null,
        wifi_ssid: data.wifiSsid ?? null,
        label: data.label ?? null,
        predicted_label: data.predictedLabel ?? null,
        source: data.source ?? "browser",
      })
      .select("id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return {
      id: String((inserted as Record<string, unknown>)["id"]),
      createdAt: String((inserted as Record<string, unknown>)["created_at"]),
    };
  });
