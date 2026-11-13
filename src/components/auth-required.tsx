import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function AuthRequired() {
  return (
    <section className="mx-auto max-w-lg border-y border-border py-14 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Private measurements</p>
      <h1 className="mt-3 font-display text-2xl font-bold text-foreground">Sign in to continue</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        Your saved Wi-Fi results and model training data are available only to your account.
      </p>
      <Button asChild className="mt-6">
        <Link to="/auth">Sign in or create an account</Link>
      </Button>
    </section>
  );
}