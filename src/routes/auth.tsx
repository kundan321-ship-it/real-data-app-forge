import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — College Wi-Fi Analyzer" },
      { name: "description", content: "Sign in to view and save your private Wi-Fi measurements." },
      { property: "og:title", content: "Sign in — College Wi-Fi Analyzer" },
      { property: "og:description", content: "Sign in to view and save your private Wi-Fi measurements." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: displayName.trim() },
          },
        });
        if (authError) throw authError;
        if (data.session) {
          await navigate({ to: "/", replace: true });
        } else {
          setNotice("Account created. Check your email to confirm, then sign in.");
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        await navigate({ to: "/", replace: true });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not complete sign-in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto grid min-h-[65vh] max-w-5xl items-center gap-10 md:grid-cols-[1fr_22rem]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Your network record</p>
        <h1 className="mt-3 max-w-xl font-display text-3xl font-bold text-foreground">Private Wi-Fi history, tied to your account.</h1>
        <p className="mt-3 max-w-lg text-sm text-muted-foreground">
          Sign in to run tests and keep your measurements, verdicts, and model training data private to you.
        </p>
        {user ? (
          <Button asChild variant="outline" className="mt-6">
            <Link to="/">Return to your measurements</Link>
          </Button>
        ) : null}
      </div>

      <div className="border-y border-border py-7">
        <div className="mb-6 flex border-b border-border text-sm">
          <button
            type="button"
            onClick={() => { setMode("signin"); setError(null); setNotice(null); }}
            className={`border-b-2 px-3 py-2 font-medium ${mode === "signin" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => { setMode("signup"); setError(null); setNotice(null); }}
            className={`border-b-2 px-3 py-2 font-medium ${mode === "signup" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
          >
            Create account
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" ? (
            <div className="space-y-2">
              <Label htmlFor="display-name">Display name</Label>
              <Input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} autoComplete="name" required />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} required />
          </div>
          {notice ? <p role="status" className="text-sm text-primary">{notice}</p> : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button className="w-full" disabled={busy || (mode === "signup" && !displayName.trim())}>
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {mode === "signup" ? "Email confirmation is required before first sign-in." : "Your history is private to your account."}
          </p>
        </form>
      </div>
    </section>
  );
}