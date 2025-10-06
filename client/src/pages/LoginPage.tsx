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
    <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-100">
      <div className="w-full max-w-md p-8 rounded-2xl border border-slate-800 bg-slate-900/50 space-y-4">
        <div className="text-center">
          <a href="/" className="font-bold text-xl" data-testid="link-logo">TEAIM.app</a>
          <div className="text-sm opacity-70">Sign in to your workspace</div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            className={`px-3 py-2 rounded-xl border ${mode === "signin" ? "bg-slate-800 border-slate-700" : "border-slate-800"}`}
            onClick={() => setMode("signin")}
            data-testid="button-mode-signin"
          >
            Sign in
          </button>
          <button
            className={`px-3 py-2 rounded-xl border ${mode === "signup" ? "bg-slate-800 border-slate-700" : "border-slate-800"}`}
            onClick={() => setMode("signup")}
            data-testid="button-mode-signup"
          >
            Sign up
          </button>
        </div>

        <div className="space-y-2">
          <input
            className="w-full border rounded-xl px-3 py-2 bg-slate-950/60 border-slate-800"
            placeholder="email@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            data-testid="input-email"
          />
          <input
            className="w-full border rounded-xl px-3 py-2 bg-slate-950/60 border-slate-800"
            placeholder="password (optional)"
            type="password"
            value={pass}
            onChange={e => setPass(e.target.value)}
            data-testid="input-password"
          />
        </div>

        <div className="flex gap-2">
          <button
            className="flex-1 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500"
            onClick={password}
            data-testid="button-password-auth"
          >
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
          <button
            className="flex-1 px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800"
            onClick={magic}
            data-testid="button-magic-link"
          >
            Email me a link
          </button>
        </div>

        {msg && <div className="text-xs opacity-70" data-testid="text-message">{msg}</div>}
      </div>
    </div>
  );
}
