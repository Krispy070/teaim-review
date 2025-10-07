import { useEffect, useState } from "react";
import { supa } from "@/lib/supabase";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supa.auth.getSession().then(s => {
      if (s.data.session) {
        const projectId = localStorage.getItem("projectId");
        location.href = projectId ? `/projects/${projectId}/dashboard` : "/getting-started";
      }
    });
  }, []);

  async function magic() {
    if (!email) {
      setMsg("Please enter your email");
      return;
    }
    setMsg("Sending magic link…");
    const projectId = localStorage.getItem("projectId");
    const redirectTo = projectId
      ? `${window.location.origin}/projects/${projectId}/dashboard`
      : `${window.location.origin}/getting-started`;
    const { error } = await supa.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo }
    });
    setMsg(error ? `Error: ${error.message}` : "Check your email for a magic link.");
  }

  async function password() {
    if (!email || !pass) {
      setMsg("Please enter email and password");
      return;
    }
    setMsg(mode === "signin" ? "Signing in…" : "Creating account…");
    const result = mode === "signin" 
      ? await supa.auth.signInWithPassword({ email, password: pass })
      : await supa.auth.signUp({ email, password: pass });
    if (result.error) {
      setMsg(`Error: ${result.error.message}`);
    } else {
      const projectId = localStorage.getItem("projectId");
      location.href = projectId ? `/projects/${projectId}/dashboard` : "/getting-started";
    }
  }

  return (
    <div className="relative min-h-screen teaim-auth-bg text-foreground">
      <div className="teaim-grid-pattern" aria-hidden />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-16">
        <div className="teaim-surface w-full max-w-md space-y-6 rounded-3xl p-10 shadow-2xl teaim-fade-in-up">
          <div className="text-center space-y-3">
            <a href="/" className="inline-flex flex-col items-center gap-2" data-testid="link-logo">
              <img src="/teaim-logo.svg" alt="TEAIM" className="h-12 w-auto drop-shadow" />
              <span className="text-lg font-semibold tracking-wide text-[var(--text-strong)]">TEAIM.app</span>
            </a>
            <p className="text-sm text-muted-foreground">Sign in to your workspace</p>
          </div>

          <div className="teaim-toggle" role="tablist" aria-label="Choose sign in method">
            <button
              type="button"
              className="text-sm"
              data-active={mode === "signin"}
              onClick={() => setMode("signin")}
              data-testid="button-mode-signin"
            >
              Sign in
            </button>
            <button
              type="button"
              className="text-sm"
              data-active={mode === "signup"}
              onClick={() => setMode("signup")}
              data-testid="button-mode-signup"
            >
              Sign up
            </button>
          </div>

          <div className="space-y-3">
            <input
              className="teaim-input w-full"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              data-testid="input-email"
            />
            <input
              className="teaim-input w-full"
              placeholder="Password (optional)"
              type="password"
              value={pass}
              onChange={e => setPass(e.target.value)}
              data-testid="input-password"
            />
          </div>

          <div className="space-y-3">
            <button
              className="teaim-cta w-full justify-center"
              onClick={password}
              data-testid="button-password-auth"
            >
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
            <button
              className="teaim-cta-ghost w-full justify-center"
              onClick={magic}
              data-testid="button-magic-link"
            >
              Email me a link
            </button>
          </div>

          {msg && <div className="text-xs text-muted-foreground" data-testid="text-message">{msg}</div>}
          <p className="text-center text-xs text-muted-foreground">
            Need help? <a className="font-medium text-[var(--accent)]" href="mailto:info@teaim.app">info@teaim.app</a>
          </p>
        </div>
      </div>
    </div>
  );
}
