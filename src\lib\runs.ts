import { supabase } from "./supabase";

export type TestRun = {
  id?: string;
  test_id: string;
  result: "pass"|"fail"|"blocked";
  notes?: string|null;
  created_at?: string;
};

export async function listRuns(testId: string) {
  const { data, error } = await supabase
    .from("test_runs")
    .select("*")
    .eq("test_id", testId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as TestRun[];
}

export async function createRun(run: TestRun) {
  const { data, error } = await supabase
    .from("test_runs")
    .insert(run)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as TestRun;
}
