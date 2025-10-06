import { supabase } from "./supabase";

export type TestCase = {
  id?: string;
  project: string;
  title: string;
  steps: string;
  expected: string;
  tags?: string | null;
  created_at?: string;
};

export async function listTestCases(project = "TEAIM") {
  const { data, error } = await supabase
    .from("test_cases")
    .select("*")
    .eq("project", project)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as TestCase[];
}

export async function createTestCase(tc: TestCase) {
  const { data, error } = await supabase
    .from("test_cases")
    .insert(tc)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as TestCase;
}

export async function updateTestCase(id: string, patch: Partial<TestCase>) {
  const { data, error } = await supabase
    .from("test_cases")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as TestCase;
}

export async function deleteTestCase(id: string) {
  const { error } = await supabase.from("test_cases").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}
