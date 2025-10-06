import { useState, useEffect } from "react";
// @ts-ignore
import { createClient } from "@supabase/supabase-js";
import { apiRequest } from "@/lib/queryClient";

// Only create Supabase client if environment variables are available
let supa: any = null;
if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
  supa = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export default function Profile(){
  const [pw,setPw]=useState(""); 
  const [msg,setMsg]=useState("");
  const [accountStatus, setAccountStatus] = useState<any>(null);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  useEffect(() => {
    loadAccountStatus();
  }, []);

  async function loadAccountStatus() {
    try {
      const response = await fetch('/api/auth/account_status');
      if (response.ok) {
        const data = await response.json();
        setAccountStatus(data);
      }
    } catch (error) {
      console.log("Could not load account status:", error);
    }
  }

  async function save(){
    setMsg("");
    if (!supa) {
      setMsg("Password change not available in development mode.");
      return;
    }
    try{
      const { data: { user } } = await supa.auth.getUser();
      if (!user){ setMsg("Not signed in."); return; }
      const { error } = await supa.auth.updateUser({ password: pw });
      setMsg(error? "Failed to update password." : "Password updated.");
      setPw("");
    }catch{ setMsg("Failed to update password."); }
  }

  async function deactivateAccount() {
    try {
      const data = await apiRequest('/api/auth/deactivate_account', 'POST', { confirm: true });
      if (data && data.ok) {
        setMsg("Account deactivated successfully. You will be logged out.");
        setTimeout(() => {
          if (supa) {
            supa.auth.signOut().then(() => window.location.href = '/');
          } else {
            window.location.href = '/';
          }
        }, 2000);
      } else {
        setMsg("Failed to deactivate account.");
      }
    } catch (error) {
      setMsg("Failed to deactivate account.");
    }
    setShowDeactivateConfirm(false);
  }

  async function closeAccount() {
    try {
      const data = await apiRequest('/api/auth/close_account', 'POST', { confirm: true });
      if (data && data.ok) {
        setMsg("Account closure requested. You will be logged out shortly.");
        setTimeout(() => {
          if (supa) {
            supa.auth.signOut().then(() => window.location.href = '/');
          } else {
            window.location.href = '/';
          }
        }, 3000);
      } else {
        setMsg("Failed to close account.");
      }
    } catch (error) {
      setMsg("Failed to close account.");
    }
    setShowCloseConfirm(false);
  }

  return (
    <div className="max-w-md mx-auto space-y-4" data-testid="profile-form">
      {/* Password Change Section */}
      <div className="brand-card p-4">
        <div className="text-sm font-medium mb-3">Change Password</div>
        <input 
          type="password" 
          className="border rounded p-2 w-full text-sm mb-3" 
          placeholder="New password" 
          value={pw} 
          onChange={e=>setPw(e.target.value)}
          data-testid="input-password"
        />
        <button 
          className="brand-btn text-xs" 
          onClick={save}
          data-testid="button-update-password"
        >
          Update Password
        </button>
      </div>

      {/* Account Status Section */}
      {accountStatus && (
        <div className="brand-card p-4">
          <div className="text-sm font-medium mb-3">Account Status</div>
          <div className="text-xs text-muted-foreground space-y-1" data-testid="account-status">
            <div><strong>Status:</strong> {accountStatus.status || 'active'}</div>
            <div><strong>Email:</strong> {accountStatus.email}</div>
            {accountStatus.created_at && (
              <div><strong>Created:</strong> {new Date(accountStatus.created_at).toLocaleDateString()}</div>
            )}
          </div>
        </div>
      )}

      {/* Account Management Section */}
      <div className="brand-card p-4">
        <div className="text-sm font-medium mb-3 text-red-600">Account Management</div>
        <div className="space-y-2">
          {!showDeactivateConfirm ? (
            <button 
              className="w-full text-xs px-3 py-2 border border-orange-300 text-orange-700 rounded hover:bg-orange-50"
              onClick={() => setShowDeactivateConfirm(true)}
              data-testid="button-deactivate-account"
            >
              Deactivate Account
            </button>
          ) : (
            <div className="border border-orange-300 rounded p-3">
              <div className="text-xs text-orange-700 mb-2">
                Are you sure? This will deactivate your account but preserve your data.
              </div>
              <div className="flex gap-2">
                <button 
                  className="flex-1 text-xs px-2 py-1 bg-orange-600 text-white rounded"
                  onClick={deactivateAccount}
                  data-testid="button-confirm-deactivate"
                >
                  Confirm Deactivate
                </button>
                <button 
                  className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded"
                  onClick={() => setShowDeactivateConfirm(false)}
                  data-testid="button-cancel-deactivate"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!showCloseConfirm ? (
            <button 
              className="w-full text-xs px-3 py-2 border border-red-300 text-red-700 rounded hover:bg-red-50"
              onClick={() => setShowCloseConfirm(true)}
              data-testid="button-close-account"
            >
              Close Account Permanently
            </button>
          ) : (
            <div className="border border-red-300 rounded p-3">
              <div className="text-xs text-red-700 mb-2">
                <strong>Warning:</strong> This will permanently close your account and cannot be undone.
              </div>
              <div className="flex gap-2">
                <button 
                  className="flex-1 text-xs px-2 py-1 bg-red-600 text-white rounded"
                  onClick={closeAccount}
                  data-testid="button-confirm-close"
                >
                  Permanently Close
                </button>
                <button 
                  className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded"
                  onClick={() => setShowCloseConfirm(false)}
                  data-testid="button-cancel-close"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {msg && (
        <div className="text-xs text-center text-muted-foreground brand-card p-2" data-testid="text-message">
          {msg}
        </div>
      )}
    </div>
  );
}