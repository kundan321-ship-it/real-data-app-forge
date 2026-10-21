CREATE TABLE public.wifi_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  download_mbps numeric NOT NULL,
  upload_mbps numeric NOT NULL,
  ping_ms numeric NOT NULL,
  jitter_ms numeric NOT NULL,
  packet_loss_pct numeric NOT NULL DEFAULT 0,
  downlink_estimate_mbps numeric,
  effective_type text,
  label text CHECK (label IN ('Good', 'Average', 'Poor')),
  predicted_label text CHECK (predicted_label IN ('Good', 'Average', 'Poor')),
  source text NOT NULL DEFAULT 'browser'
);

GRANT SELECT, INSERT ON public.wifi_measurements TO anon;
GRANT SELECT, INSERT ON public.wifi_measurements TO authenticated;
GRANT ALL ON public.wifi_measurements TO service_role;

ALTER TABLE public.wifi_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view measurements"
  ON public.wifi_measurements
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can log measurements"
  ON public.wifi_measurements
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

INSERT INTO public.wifi_measurements
  (created_at, download_mbps, upload_mbps, ping_ms, jitter_ms, packet_loss_pct, downlink_estimate_mbps, effective_type, label, predicted_label, source)
VALUES
  (now() - interval '1 day', 52.4, 18.2, 28, 4, 0, 48, '4g', 'Good', 'Good', 'seed'),
  (now() - interval '1 day', 45.8, 15.6, 35, 6, 0.5, 41, '4g', 'Good', 'Good', 'seed'),
  (now() - interval '1 day', 68.1, 22.4, 21, 3, 0, 55, '4g', 'Good', 'Good', 'seed'),
  (now() - interval '1 day', 40.2, 12.8, 48, 8, 1, 38, '4g', 'Good', 'Good', 'seed'),
  (now() - interval '1 day', 84.6, 30.1, 18, 2, 0, 60, '4g', 'Good', 'Good', 'seed'),
  (now() - interval '1 day', 55.3, 20.5, 31, 5, 0, 44, '4g', 'Good', 'Good', 'seed'),
  (now() - interval '1 day', 61.9, 25.3, 26, 4, 0, 50, '4g', 'Good', 'Good', 'seed'),
  (now() - interval '1 day', 43.7, 14.1, 39, 7, 0.5, 40, '4g', 'Good', 'Good', 'seed'),
  (now() - interval '2 days', 22.5, 8.4, 72, 12, 1.5, 20, '4g', 'Average', 'Average', 'seed'),
  (now() - interval '2 days', 18.2, 6.9, 88, 15, 2, 18, '4g', 'Average', 'Average', 'seed'),
  (now() - interval '2 days', 30.6, 10.2, 64, 10, 1, 26, '4g', 'Average', 'Average', 'seed'),
  (now() - interval '2 days', 25.1, 9.1, 95, 14, 2.5, 22, '4g', 'Average', 'Average', 'seed'),
  (now() - interval '2 days', 15.8, 5.6, 110, 18, 3, 15, '4g', 'Average', 'Average', 'seed'),
  (now() - interval '2 days', 33.4, 11.8, 58, 9, 1, 28, '4g', 'Average', 'Average', 'seed'),
  (now() - interval '2 days', 27.9, 7.8, 82, 13, 2, 24, '4g', 'Average', 'Average', 'seed'),
  (now() - interval '2 days', 20.4, 6.2, 76, 11, 1.5, 19, '4g', 'Average', 'Average', 'seed'),
  (now() - interval '2 days', 35.2, 13.4, 51, 8, 0.5, 30, '4g', 'Average', 'Average', 'seed'),
  (now() - interval '2 days', 12.6, 4.8, 118, 20, 3.5, 12, '4g', 'Average', 'Average', 'seed'),
  (now() - interval '3 days', 8.4, 2.1, 168, 28, 6, 8, '3g', 'Poor', 'Poor', 'seed'),
  (now() - interval '3 days', 5.2, 1.4, 220, 35, 8.5, 5, '3g', 'Poor', 'Poor', 'seed'),
  (now() - interval '3 days', 3.8, 0.9, 260, 42, 12, 4, '3g', 'Poor', 'Poor', 'seed'),
  (now() - interval '3 days', 6.9, 1.8, 195, 30, 7, 7, '3g', 'Poor', 'Poor', 'seed'),
  (now() - interval '3 days', 9.6, 2.6, 152, 24, 5.5, 9, '3g', 'Poor', 'Poor', 'seed'),
  (now() - interval '3 days', 4.1, 1.1, 245, 38, 10, 4, '3g', 'Poor', 'Poor', 'seed'),
  (now() - interval '3 days', 7.3, 2.0, 178, 26, 6.5, 7, '3g', 'Poor', 'Poor', 'seed'),
  (now() - interval '3 days', 2.9, 0.7, 290, 45, 14, 3, '3g', 'Poor', 'Poor', 'seed'),
  (now() - interval '3 days', 8.8, 2.3, 160, 27, 6, 9, '3g', 'Poor', 'Poor', 'seed');