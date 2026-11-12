ALTER TABLE public.wifi_measurements ADD COLUMN user_id uuid;
CREATE INDEX wifi_measurements_user_created_idx ON public.wifi_measurements (user_id, created_at DESC);
DROP POLICY IF EXISTS "Anyone can view measurements" ON public.wifi_measurements;
DROP POLICY IF EXISTS "Anyone can log valid measurements" ON public.wifi_measurements;
CREATE POLICY "Users can view their own measurements" ON public.wifi_measurements FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can log valid own measurements" ON public.wifi_measurements FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND download_mbps >= 0 AND download_mbps <= 2000 AND upload_mbps >= 0 AND upload_mbps <= 2000 AND ping_ms >= 0 AND ping_ms <= 60000 AND jitter_ms >= 0 AND jitter_ms <= 60000 AND packet_loss_pct >= 0 AND packet_loss_pct <= 100 AND (downlink_estimate_mbps IS NULL OR (downlink_estimate_mbps >= 0 AND downlink_estimate_mbps <= 2000)) AND (effective_type IS NULL OR char_length(effective_type) <= 20) AND (label IS NULL OR label IN ('Good', 'Average', 'Poor')) AND (predicted_label IS NULL OR predicted_label IN ('Good', 'Average', 'Poor')) AND (source IS NULL OR char_length(source) <= 40) AND (network_name IS NULL OR char_length(network_name) <= 160) AND (wifi_ssid IS NULL OR char_length(wifi_ssid) <= 60));
REVOKE SELECT, INSERT ON public.wifi_measurements FROM anon;
GRANT SELECT, INSERT ON public.wifi_measurements TO authenticated;
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE FUNCTION public.handle_new_user_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'display_name', ''), split_part(COALESCE(NEW.email, ''), '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC;
CREATE TRIGGER on_auth_user_created_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();