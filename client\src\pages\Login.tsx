import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supa } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Redirect if already authenticated
  useEffect(() => {
    if (user) {
      const redirectPath = localStorage.getItem('auth-redirect-path') || '/dashboard';
      localStorage.removeItem('auth-redirect-path');
      navigate(redirectPath);
    }
  }, [user, navigate]);
  
  async function send() {
    if (loading) return;
    
    setLoading(true);
    try {
      const { error } = await supa.auth.signInWithOtp({ 
        email,
        options: {
          emailRedirectTo: window.location.origin + '/dashboard'
        }
      });
      if (error) {
        alert(error.message);
      } else {
        setSent(true);
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }
  
  return (
    <div className="p-6 max-w-md mx-auto space-y-3" data-testid="login-page">
      <h1 className="text-xl font-semibold">Sign in</h1>
      {!sent ? (
        <>
          <input 
            className="border rounded p-2 w-full" 
            placeholder="you@company.com"
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            data-testid="input-email"
          />
          <button 
            className="brand-btn" 
            onClick={send}
            disabled={loading || !email.trim()}
            data-testid="button-send-magic-link"
          >
            {loading ? 'Sending...' : 'Send magic link'}
          </button>
        </>
      ) : (
        <div className="text-center text-muted-foreground" data-testid="message-check-email">
          Check your email for a sign-in link.
        </div>
      )}
    </div>
  );
}