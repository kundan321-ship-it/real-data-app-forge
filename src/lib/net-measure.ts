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

async function measureDownload(
  totalBytes: number,
  maxMs: number,
  onLive?: (mbps: number) => void,
): Promise<number> {
  const controller = new AbortController();
  let bytes = 0;
  let abortedByCap = false;
  const start = performance.now();

  try {
    const res = await fetch(`${CF_BASE}/__down?bytes=${totalBytes}&t=${Date.now()}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok || !res.body) throw new Error(`Speed test server error (${res.status})`);
    const reader = res.body.getReader();
    let lastUpdate = 0;
    for (;;) {
      const elapsedMs = performance.now() - start;
      if (elapsedMs > maxMs) {
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

// ============= Network identity =============

/**
 * Browsers cannot read the Wi-Fi SSID directly, so we resolve the network's
 * real identity from the public IP: ISP / organization name (what the college
 * network is operated by) plus a city/country line. This is the network that
 * actually carried the measurement — not a fake or hardcoded name.
 */
export interface NetworkIdentity {
  name: string;
  isp: string | null;
  location: string | null;
  ip: string | null;
}

interface IpWhoIsResponse {
  success?: boolean;
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  connection?: { isp?: string; org?: string; asn?: number | string; domain?: string };
}

/** Normalized shape both lookup providers are read through. */
interface IpApiResponse {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  isp?: string | null;
  org?: string | null;
  asn?: number | string | null;
}

export async function fetchNetworkIdentity(): Promise<NetworkIdentity | null> {
  const read = (body: IpWhoIsResponse | IpApiResponse): NetworkIdentity | null => {
    const isp = body.isp ?? body.org ?? null;
    if (!isp) return null;

    const asn = body.asn ? ` (AS${body.asn})` : "";
    const locationParts = [body.city, body.country].filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    );

    return {
      name: `${isp}${asn}`,
      isp,
      location: locationParts.length > 0 ? locationParts.join(", ") : null,
      ip: typeof body.ip === "string" ? body.ip : null,
    };
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://ipwho.is/${Date.now()}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (res.ok) {
      const body = (await res.json()) as IpWhoIsResponse;
      if (body.success !== false) {
        const parsed = read({ ...body, isp: body.connection?.isp ?? null, org: body.connection?.org ?? null, asn: body.connection?.asn ?? null });
        if (parsed) return parsed;
      }
    }
  } catch {
    // fall through to the backup provider
  }

  // Backup provider (ipapi.co) in case the primary lookup is unreachable.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://ipapi.co/json/?t=${Date.now()}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return read((await res.json()) as IpApiResponse);
  } catch {
    return null;
  }
}

/** Run the full real-network speed test: latency probes, download, upload. */
export async function runSpeedTest(handlers?: {
  onStage?: (stage: TestStage) => void;
  onLiveDownload?: (mbps: number) => void;
}): Promise<SpeedTestResult> {
  handlers?.onStage?.("latency");
  const latency = await measureLatency();

  handlers?.onStage?.("download");
  let downloadMbps = await measureDownload(DOWNLOAD_BYTES, DOWNLOAD_MAX_MS, handlers?.onLiveDownload);
  // On stalled or heavily throttled networks the big transfer can yield zero
  // bytes — retry once with a smaller request before reporting 0.
  if (downloadMbps <= 0) {
    downloadMbps = await measureDownload(4 * 1024 * 1024, 12000, handlers?.onLiveDownload);
  }
  if (downloadMbps <= 0) {
    throw new Error(
      "Download measurement failed — the network stalled or blocked the test transfer. Try again.",
    );
  }

  handlers?.onStage?.("upload");
  const uploadMbps = await measureUpload();

  return { ...latency, downloadMbps, uploadMbps };
}
