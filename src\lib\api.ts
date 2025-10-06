export async function pingApi() {
  const r = await fetch("/api/health");
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}
