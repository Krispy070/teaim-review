export type TestRun = {
  id?: string;
  test_id: string;
  result: "pass" | "fail" | "blocked";
  notes: string;
  created_at?: string;
};

export async function listRuns(testId: string): Promise<TestRun[]> {
  const r = await fetch(`/api/tests/${testId}/runs`);
  if (!r.ok) throw new Error(`Failed to fetch runs: ${r.statusText}`);
  const data = await r.json();
  return data.items || [];
}

export async function createRun(run: TestRun): Promise<TestRun> {
  const r = await fetch(`/api/tests/${run.test_id}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(run),
  });
  if (!r.ok) throw new Error(`Failed to create run: ${r.statusText}`);
  return r.json();
}
