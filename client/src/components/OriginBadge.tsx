import { getProjectId, ensureProjectPath } from "@/lib/project";

export default function OriginBadge({ type, id }: { type?: string | null; id?: string | null }) {
  if (!type || !id) return null;
  const label = type === "doc" ? "Doc" : type === "conversation" ? "Conv" : type === "meeting" ? "Meeting" : "Origin";
  const href =
    type === "doc" ? ensureProjectPath(`/documents?focus=${id}`) :
    type === "conversation" ? ensureProjectPath(`/conversations?focus=${id}`) :
    type === "meeting" ? ensureProjectPath(`/meetings?focus=${id}`) : "#";
  return (
    <a 
      className="text-[11px] px-1.5 py-0.5 rounded-full border border-slate-600 hover:bg-slate-800" 
      href={href} 
      title="Open source"
      data-testid={`origin-badge-${type}`}
    >
      {label}
    </a>
  );
}
