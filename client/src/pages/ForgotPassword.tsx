import { useState } from "react";

export default function ForgotPassword(){
  const [email,setEmail]=useState(""); const [msg,setMsg]=useState("");
  async function send(){
    setMsg("");
    // Try backend (admin-generated recovery link)
    const r = await fetch(`/api/auth/request_reset?email=${encodeURIComponent(email)}`, { method:"POST" });
    const d = await r.json().catch(()=>({ok:false}));
    if (d.ok){ setMsg("Check your email for an email link to reset your password."); return; }

    // Fallback: supabase-js in browser (if you expose supabase client)
    try{
      // @ts-ignore
      const { createClient } = await import("@supabase/supabase-js");
      // You must expose NEXT_PUBLIC/VITE_SUPABASE_URL + ANON_KEY in client env
      // @ts-ignore
      const supa = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
      const { error } = await supa.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/auth/update-password" });
      if (!error){ setMsg("Check your email for an email link to reset your password."); return; }
    }catch{}
    setMsg("Unable to send reset link. Contact an admin.");
  }
  return (
    <div className="max-w-md mx-auto brand-card p-3" data-testid="forgot-password-form">
      <div className="text-sm font-medium mb-2">Forgot Password</div>
      <input 
        type="email"
        required
        className="border rounded p-2 w-full text-sm mb-2" 
        placeholder="you@company.com" 
        value={email} 
        onChange={e=>setEmail(e.target.value)}
        data-testid="input-email"
      />
      <button 
        className="brand-btn text-xs mb-2 w-full" 
        onClick={send}
        data-testid="button-request-reset"
      >
        Send reset link
      </button>
      <div className="text-center">
        <a href="/login" className="text-xs text-blue-600 hover:underline">
          Back to Login
        </a>
      </div>
      {msg && <div className="text-xs mt-2 text-muted-foreground" data-testid="text-message">{msg}</div>}
    </div>
  );
}