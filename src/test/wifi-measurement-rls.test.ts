import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  `${process.cwd()}/drizzle/migrations/0004_private_wifi_measurement_history.sql`,
  "utf8",
);

describe("private Wi-Fi measurement policies", () => {
  it("does not leave public or anonymous read access to saved measurements", () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "Anyone can view measurements"');
    expect(migration).toContain('CREATE POLICY "Users can view their own measurements"');
    expect(migration).toMatch(/FOR SELECT TO authenticated USING \(auth\.uid\(\) = user_id\)/);
    expect(migration).toContain("REVOKE SELECT, INSERT ON public.wifi_measurements FROM anon");
    expect(migration).not.toMatch(/FOR SELECT\s+TO anon\b/);
    expect(migration).not.toMatch(/FOR SELECT\s+TO anon,\s*authenticated\s+USING\s*\(true\)/);
  });

  it("allows inserts only for the signed-in owner and preserves measurement bounds", () => {
    expect(migration).toContain('CREATE POLICY "Users can log valid own measurements"');
    expect(migration).toMatch(/WITH CHECK \(auth\.uid\(\) = user_id AND download_mbps >= 0/);
    expect(migration).toContain("packet_loss_pct <= 100");
    expect(migration).toContain("char_length(wifi_ssid) <= 60");
  });
});