-- Tighten the public INSERT policy: previously anyone could insert ANY
-- values. Now the policy itself validates every field server-side
-- (mirrors the app's input validation) so malformed or absurd rows are
-- rejected at the database level regardless of the caller.
DROP POLICY IF EXISTS "Anyone can log measurements" ON public.wifi_measurements;

CREATE POLICY "Anyone can log valid measurements"
  ON public.wifi_measurements
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    download_mbps >= 0 AND download_mbps <= 2000
    AND upload_mbps >= 0 AND upload_mbps <= 2000
    AND ping_ms >= 0 AND ping_ms <= 60000
    AND jitter_ms >= 0 AND jitter_ms <= 60000
    AND packet_loss_pct >= 0 AND packet_loss_pct <= 100
    AND (downlink_estimate_mbps IS NULL OR (downlink_estimate_mbps >= 0 AND downlink_estimate_mbps <= 2000))
    AND (effective_type IS NULL OR char_length(effective_type) <= 20)
    AND (label IS NULL OR label IN ('Good', 'Average', 'Poor'))
    AND (predicted_label IS NULL OR predicted_label IN ('Good', 'Average', 'Poor'))
    AND (source IS NULL OR char_length(source) <= 40)
    AND (network_name IS NULL OR char_length(network_name) <= 160)
    AND (wifi_ssid IS NULL OR char_length(wifi_ssid) <= 60)
  );