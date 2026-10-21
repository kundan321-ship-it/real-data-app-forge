/**
 * Real-time network measurement engine (browser).
 *
 * Measures actual throughput, latency, jitter and packet loss against
 * Cloudflare's public speed-measurement endpoints — the same endpoints used
 * by browser-based speed test tools. No fake or hardcoded values.
 *
 * Note: browsers cannot read the Wi-Fi SSID or radio signal strength (dBm).
 * Where the blueprint expects signal info we surface the browser's own
 * Network Information API estimates (effective type, downlink, RTT) instead,
 * and the UI labels them as browser-reported estimates.
 */

const CF_BASE = "https://speed.cloudflare.com";

export type TestStage = "latency" | "download" | "upload";

export interface SpeedTestResult {
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  jitterMs: number;
  packetLossPct: number;
}

export interface ConnectionInfo {
  downlinkMbps: number | null;
  effectiveType: string | null;
  rttMs: number | null;
}

const LATENCY_PROBES = 10;
const PROBE_TIMEOUT_MS = 4000;
const DOWNLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
const DOWNLOAD_MAX_MS = 9000;
const UPLOAD_BYTES = 6 * 1024 * 1024; // 6 MB

/** Read the browser's Network Information API estimates. Browser-only. */
export function readConnectionInfo(): ConnectionInfo {
  if (typeof navigator === "undefined") {
    return { downlinkMbps: null, effectiveType: null, rttMs: null };
  }
  const conn = (navigator as Navigator & {
    connection?: { downlink?: number; effectiveType?: string; rtt?: number };
  }).connection;
  return {
    downlinkMbps: typeof conn?.downlink === "number" ? conn.downlink : null,
    effectiveType: typeof conn?.effectiveType === "string" ? conn.effectiveType : null,
    rttMs: typeof conn?.rtt === "number" ? conn.rtt : null,
  };
}

async function timedProbe(): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const start = performance.now();
  try {
    const res = await fetch(`${CF_BASE}/__down?bytes=1&t=${Date.now()}_${Math.random()}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    await res.arrayBuffer();
    return performance.now() - start;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid]!;
  const lower = sorted[mid - 1] ?? upper;
  return sorted.length % 2 === 0 ? (lower + upper) / 2 : upper;
}

interface LatencyResult {
  pingMs: number;
  jitterMs: number;
  packetLossPct: number;
}

async function measureLatency(): Promise<LatencyResult> {
  const samples: number[] = [];
  let failures = 0;

  for (let i = 0; i < LATENCY_PROBES; i++) {
    const ms = await timedProbe();
    if (ms === null) failures++;
    else samples.push(ms);
  }

  if (samples.length === 0) {
    throw new Error(
      "Network unreachable — the speed test server could not be reached. Check your internet connection.",
    );
  }

  const pingMs = median(samples);

  // Jitter: mean absolute difference between consecutive probe times.
  let jitterSum = 0;
  if (samples.length > 1) {
    for (let i = 1; i < samples.length; i++) jitterSum += Math.abs(samples[i]! - samples[i - 1]!);
  }
  const jitterMs = samples.length > 1 ? jitterSum / (samples.length - 1) : 0;

  return {
    pingMs: Math.round(pingMs * 10) / 10,
    jitterMs: Math.round(jitterMs * 10) / 10,
    packetLossPct: Math.round((failures / LATENCY_PROBES) * 1000) / 10,
  };
}

async function measureDownload(onLive?: (mbps: number) => void): Promise<number> {
  const controller = new AbortController();
  let bytes = 0;
  let abortedByCap = false;
  const start = performance.now();

  try {
    const res = await fetch(`${CF_BASE}/__down?bytes=${DOWNLOAD_BYTES}&t=${Date.now()}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok || !res.body) throw new Error(`Speed test server error (${res.status})`);
    const reader = res.body.getReader();
    let lastUpdate = 0;
    for (;;) {
      const elapsedMs = performance.now() - start;
      if (elapsedMs > DOWNLOAD_MAX_MS) {
        abortedByCap = true;
        controller.abort();
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) bytes += value.byteLength;
      if (onLive && performance.now() - lastUpdate > 120) {
        lastUpdate = performance.now();
        onLive((bytes * 8) / 1e6 / Math.max(elapsedMs / 1000, 0.05));
      }
    }
  } catch (error) {
    // Time-cap aborts are expected: we keep the bytes counted so far.
    if (!abortedByCap && bytes === 0) {
      throw error instanceof Error ? error : new Error("Download test failed. Check your connection.");
    }
  }

  const elapsedSec = Math.max((performance.now() - start) / 1000, 0.05);
  return Math.round(((bytes * 8) / 1e6 / elapsedSec) * 10) / 10;
}

async function measureUpload(): Promise<number> {
  const payload = new Uint8Array(UPLOAD_BYTES);
  for (let offset = 0; offset < UPLOAD_BYTES; offset += 65536) {
    crypto.getRandomValues(payload.subarray(offset, Math.min(offset + 65536, UPLOAD_BYTES)));
  }
  const start = performance.now();
  let res: Response;
  try {
    res = await fetch(`${CF_BASE}/__up?bytes=${UPLOAD_BYTES}`, {
      method: "POST",
      body: payload,
      cache: "no-store",
    });
  } catch {
    throw new Error("Upload test failed — the network rejected the upload. Try again.");
  }
  if (!res.ok) throw new Error(`Upload test failed (server responded ${res.status}).`);
  await res.arrayBuffer();
  const elapsedSec = Math.max((performance.now() - start) / 1000, 0.05);
  return Math.round(((UPLOAD_BYTES * 8) / 1e6 / elapsedSec) * 10) / 10;
}

/** Run the full real-network speed test: latency probes, download, upload. */
export async function runSpeedTest(handlers?: {
  onStage?: (stage: TestStage) => void;
  onLiveDownload?: (mbps: number) => void;
}): Promise<SpeedTestResult> {
  handlers?.onStage?.("latency");
  const latency = await measureLatency();

  handlers?.onStage?.("download");
  const downloadMbps = await measureDownload(handlers?.onLiveDownload);

  handlers?.onStage?.("upload");
  const uploadMbps = await measureUpload();

  return { ...latency, downloadMbps, uploadMbps };
}
