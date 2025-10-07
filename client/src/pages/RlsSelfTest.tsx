import { useState } from "react";
import { useLocation } from "wouter";
import { getJSON } from "@/lib/authFetch";
import { useOrg } from "../App";
import { RoleGate } from "@/components/ui/role-gate";

export default function RlsSelfTest() {
  const [location] = useLocation();
  // Extract projectId from URL path /projects/:projectId/...
  const urlProjectId = location.split('/')[2];
  const { projectId: orgProjectId, userRole } = useOrg();
  const projectId = urlProjectId || orgProjectId;
  const [otherProjectId, setOtherProjectId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function runTest() {
    if (!otherProjectId.trim()) {
      alert("Please enter a project UUID to test against");
      return;
    }

    setLoading(true);
    try {
      const response = await getJSON(`/api/admin/rls-selftest/test?project_id=${projectId}&other_project_id=${otherProjectId}`);
      setResult(response);
    } catch (error) {
      console.error("RLS test failed:", error);
      // Check HTTP status for auth/config errors (401, 403, 5xx) - should be inconclusive
      let isAuthConfigError = false;
      if (error instanceof Error) {
        // Check for auth-related errors by message content or status
        const errorMsg = error.message.toLowerCase();
        isAuthConfigError = errorMsg.includes('401') || errorMsg.includes('unauthorized') || 
                           errorMsg.includes('jwt') || errorMsg.includes('auth') ||
                           errorMsg.includes('403') || errorMsg.includes('forbidden');
      }
      
      setResult({ 
        ok: false,
        leak: isAuthConfigError ? null : false, // null = inconclusive, false = actual fail
        error: error instanceof Error ? error.message : "Test failed",
        tested_against: otherProjectId 
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <RoleGate allow={['owner', 'admin']} role={userRole}>
      <div className="p-6 space-y-6" data-testid="page-rls-selftest">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          RLS Self-Test
        </h1>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h2 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
            Verify Tenant Isolation
          </h2>
          <p className="text-blue-800 dark:text-blue-200 text-sm mb-2">
            This test tries to read another project via Row-Level Security (RLS). 
            Passing means no cross-project data leak.
          </p>
          <ul className="text-blue-700 dark:text-blue-300 text-sm space-y-1">
            <li>• Enter another project UUID and click Run Test</li>
            <li>• Green result = PASS (no tenant leak detected)</li>
            <li>• Red result = FAIL (security vulnerability found)</li>
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-3">
          <input
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            placeholder="Other Project UUID (e.g., 12345678-9999-9999-9999-999999999999)"
            value={otherProjectId}
            onChange={e => setOtherProjectId(e.target.value)}
            data-testid="input-other-project-id"
            disabled={loading}
          />
          <button
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-md border-0 disabled:cursor-not-allowed"
            onClick={runTest}
            disabled={loading || !otherProjectId.trim()}
            data-testid="button-run-test"
          >
            {loading ? "Testing..." : "Run Test"}
          </button>
        </div>

        {result && (
          <div
            className={`px-4 py-3 rounded-md border ${
              result.ok
                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200"
                : result.leak === null
                  ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200"
                  : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
            }`}
            data-testid="test-result"
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold">
                {result.ok ? "✅ PASS" : (result.leak === null || result.test_details?.coverage_incomplete) ? "⚠️ INCONCLUSIVE" : "❌ FAIL"}
              </span>
              <span>
                {result.ok 
                  ? "No tenant leak detected" 
                  : (result.leak === null || result.test_details?.coverage_incomplete)
                    ? "Test inconclusive (auth/config/coverage error)" 
                    : "Security vulnerability found"}
              </span>
            </div>
            <div className="text-sm mt-2 opacity-75">
              Tested against: {result.tested_against}
            </div>
            {result.error && (
              <div className="text-sm mt-2 bg-red-100 dark:bg-red-900/30 p-2 rounded border">
                Error: {result.error}
              </div>
            )}
            {result.test_details && (
              <details className="text-sm mt-2">
                <summary className="cursor-pointer font-medium">Test Details</summary>
                <pre className="mt-1 bg-gray-100 dark:bg-gray-800 p-2 rounded text-xs overflow-auto">
                  {JSON.stringify(result.test_details, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>

      <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded">
        <strong>Current Project:</strong> {projectId}
        <br />
        <strong>Security Level:</strong> Admin-only access required
        <br />
        <strong>Tables Tested:</strong> artifacts, project_stages, risks, decisions
      </div>
    </div>
    </RoleGate>
  );
}