# Secure personal Wi-Fi measurement history

## User-visible changes
- Require sign-in before users can save or view measurement history and model training data.
- Add email/password sign-up and sign-in, collect a display name, and provide sign-out.
- Show only the signed-in user's saved measurements across Live Test, History, and ML Model.
- Keep existing network testing and seven-day cleanup behavior.

## Technical approach
- Add a `profiles` table with a display name, signup trigger, and owner-only read/update policies.
- Add an optional owner ID to existing measurements, remove anonymous read/insert access, and scope authenticated SELECT/INSERT policies to `auth.uid()` while preserving current measurement validation.
- Protect save and fetch server functions with `requireSupabaseAuth`; include the authenticated user ID on inserts and retain the existing rate limit.
- Add a public `/auth` screen, session-aware header, and client-side queries for protected data; do not call protected functions from public route loaders.
- Keep legacy measurements unassigned and inaccessible rather than exposing or guessing their owners.
- Verify the selected finding is marked fixed only after the policy and app changes are in place; do not act on other findings.
