import { useState, useEffect } from "react";

type DashStats = {
  totalTests: number;
  passRate: number;
  failRate: number;
  blockedRate: number;
};

export default function MiniDash({ projectId }: { projectId: string }) {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const r = await fetch(`/api/tests/stats?projectId=${projectId}`);
      const data = await r.json();
      setStats(data);
    } catch (e) {
      console.error("Failed to load test stats:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [projectId]);

  useEffect(() => {
    const handler = () => { void load(); };
    window.addEventListener("runs:changed", handler);
    return () => window.removeEventListener("runs:changed", handler);
  }, [projectId]);

  if (loading) {
    return <div className="card p-4">Loading stats...</div>;
  }

  if (!stats) {
    return <div className="card p-4">No stats available</div>;
  }

  return (
    <div className="card p-4 mb-4">
      <h3 className="text-lg font-semibold mb-3">Test Dashboard</h3>
      <div className="grid grid-cols-4 gap-4">
        <div>
          <div className="text-text-muted text-sm">Total Tests</div>
          <div className="text-2xl font-bold">{stats.totalTests}</div>
        </div>
        <div>
          <div className="text-text-muted text-sm">Pass Rate</div>
          <div className="text-2xl font-bold text-green-600">{stats.passRate}%</div>
        </div>
        <div>
          <div className="text-text-muted text-sm">Fail Rate</div>
          <div className="text-2xl font-bold text-red-600">{stats.failRate}%</div>
        </div>
        <div>
          <div className="text-text-muted text-sm">Blocked Rate</div>
          <div className="text-2xl font-bold text-yellow-600">{stats.blockedRate}%</div>
        </div>
      </div>
    </div>
  );
}
