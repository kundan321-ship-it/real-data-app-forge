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
- The Wi-Fi SSID (e.g. "CGC@C4") is a user-supplied name: the user assigns it once (hero input), it persists in localStorage (`wifi-analyzer-ssid`) via `getSavedSsid`/`saveSsid` in `src/lib/net-measure.ts`, and it is saved as `wifi_ssid` on every measurement. The SSID never comes from an API or guess. Why: browsers cannot read the SSID, and the user explicitly wants their Wi-Fi's own name on every result.
- All run timestamps shown to the user use the `fmtWhen` helper (date · time, e.g. "23 Oct 2026 · 18:45"); keep it defined per route module (index/history/model). Why: the user explicitly asked for date and time with every saved performance.
