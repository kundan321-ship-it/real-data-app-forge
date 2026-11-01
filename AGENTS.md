<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules

- Network identity (the "network name" saved with each measurement) is resolved client-side in `src/lib/net-measure.ts` via ipwho.is (ISP/ASN of the public IP, with ipapi.co and geojs.io fallbacks) — browsers cannot read the Wi-Fi SSID. Never fabricate a name: if every lookup fails, show "unknown" in the UI and save null. Why: the app must only show real network data.
- The network name is auto-detected: on page load the resolved operator name (ISP/ASN) is adopted automatically as the network name (localStorage `wifi-analyzer-ssid` via `saveSsid` in `src/lib/net-measure.ts`) unless the user has typed their own Wi-Fi name (e.g. "CGC@C4"), which always overrides it. The user-set name is never overwritten by a later auto-detect. Why: the user asked for zero manual steps; browsers cannot read the SSID, so the detected operator name is the best real signal and must never be fabricated.
- Background auto-testing is client-side only (src/lib/auto-run.ts + a timer loop in `src/routes/index.tsx`): while the tab stays open, a measurement runs every 15/30/60 min (localStorage keys `wifi-analyzer-autorun`, `wifi-analyzer-autorun-mins`) and saves with source "background-auto". A server cannot measure the user's Wi-Fi — never move this server-side.
- History keeps the last 7 days: `getMeasurements` filters `created_at >= now() - 7 days`, and the managed daily schedule "cleanup-wifi-history-7d" POSTs `/api/public/jobs/cleanup-history` (auth via `authenticateCronRequest`, admin client inside the handler) which deletes older rows.
- Security hardening (keep in place when touching these areas): the `wifi_measurements` INSERT RLS policy itself validates every field (ranges 0–2000 Mbps / 0–60000 ms / 0–100 %, label enums, string length caps — migration `0003_validate_measurement_insert`); `saveMeasurement` enforces a global rate limit of 60 saves/minute; `src/server.ts` adds security headers (nosniff, referrer-policy, permissions-policy) to every response; frame-ancestors stays open because the Lovable preview embeds the app in an iframe; dependency overrides in package.json pin patched js-yaml/seroval/source-map-js/zod. Do not relax any of these.
- All run timestamps shown to the user use the `fmtWhen` helper (date · time, e.g. "23 Oct 2026 · 18:45"); keep it defined per route module (index/history/model). Why: the user explicitly asked for date and time with every saved performance.
