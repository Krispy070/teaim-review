type KapmemSaveOptions = {
  source?: string;
  project?: string;
  kind?: string;
  tags?: string;
};

export async function kapmemSave(
  content: string,
  options: KapmemSaveOptions = {}
): Promise<void> {
  const r = await fetch("/api/kapmem/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, ...options }),
  });
  if (!r.ok) throw new Error(`Failed to save to kapmem: ${r.statusText}`);
}
