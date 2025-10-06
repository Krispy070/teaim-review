import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { applyBrandClass } from "@/lib/brand"

applyBrandClass(); // ensure the brand-v2 class is on <html> before app renders

// Development-only cache clearing to fix persistent UI caching issues
if (import.meta.env.DEV) {
  (async () => {
    let shouldReload = false;
    
    // Unregister all service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        shouldReload = true;
        console.log('🔧 Cleared service worker:', registration.scope);
      }
    }
    
    // Clear all caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        await caches.delete(cacheName);
        shouldReload = true;
        console.log('🔧 Cleared cache:', cacheName);
      }
    }
    
    // Force reload if we cleared anything to ensure fresh UI
    if (shouldReload && !window.location.search.includes('fresh=')) {
      console.log('🔧 Forcing hard reload to clear stale UI...');
      window.location.replace('/?fresh=' + Date.now());
      return;
    }
  })();
}

// Browser console helpers for testing (Step 5)
if (import.meta.env.DEV) {
  window.runSeedSmokeTest = async (projectId = "e1ec6ad0-a4e8-45dd-87b0-e123776ffe6e") => {
    console.log("🧪 Running seed smoke test for project:", projectId);
    try {
      const response = await fetch("/admin/test/seed-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId })
      });
      const result = await response.json();
      console.log("✅ Seed smoke test result:", result);
      return result;
    } catch (error) {
      console.error("❌ Seed smoke test failed:", error);
      return { ok: false, error: error.message };
    }
  };

  window.dbInfo = async () => {
    console.log("🔍 Fetching database info...");
    try {
      const response = await fetch("/admin/test/debug");
      const result = await response.json();
      console.log("✅ Database info:", result);
      return result;
    } catch (error) {
      console.error("❌ Database info failed:", error);
      return { ok: false, error: error.message };
    }
  };

  console.log("🛠️ Development helpers loaded:");
  console.log("  • window.runSeedSmokeTest(projectId?) - Run seed test");
  console.log("  • window.dbInfo() - Get database connection info");
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)