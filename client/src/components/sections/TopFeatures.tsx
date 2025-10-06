import { BurstTile } from "../ui/BurstTile";

export default function TopFeatures() {
  const items = [
    { id: "doc-intelligence", icon: "📄", title: <>Document <span className="emph">Intelligence</span></>, copy: "Ingest meetings & docs, redact PII, embed references, extract actions & decisions." },
    { id: "integrations", icon: "🔗", title: <>Integrations & <span className="emph">Dependencies</span></>, copy: "Kanban + grid, import/export, test runs, dependency graph, exec tiles." },
    { id: "risks", icon: "🔥", title: <><span className="emph">Risks</span> Engine</>, copy: "AI tags risks across workstreams. Heatmap, filters, CSV/SVG exports." },
    { id: "training", icon: "📅", title: <>Training <span className="emph">Planner</span></>, copy: "Import your planner. Grid + calendar, bulk scheduling with ICS." },
    { id: "governance", icon: "🛡️", title: <>Enterprise <span className="emph">Governance</span></>, copy: "Cadences with ICS, reminders, digest, notifications, sign-offs." },
    { id: "wizard", icon: "🧰", title: <>Setup <span className="emph">Wizard</span></>, copy: "Seed releases, playbooks, training in one go—fast onboarding to value." },
  ];

  return (
    <section className="border-t border-border" data-testid="section-top-features">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold" data-testid="heading-top-features">Everything you need to deliver</h2>
        <div className="feature-grid mt-5">
          {items.map((it) => (
            <BurstTile key={it.id} className="feature-tile" data-testid={`feature-tile-${it.id}`}>
              <div className="feature-icon" aria-hidden>{it.icon}</div>
              <div className="font-medium">{it.title}</div>
              <p className="text-sm text-muted mt-1">{it.copy}</p>
            </BurstTile>
          ))}
        </div>
      </div>
    </section>
  );
}
