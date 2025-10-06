import { useRef } from "react";

type Perk = { title: JSX.Element; icon: string; copy: string };

export default function BetaPerks(){
  const perks: Perk[] = [
    { title: <>Early access to <span className="emph">AI-native</span> features</>, icon: "🚀",
      copy: "Get builds first and try new capabilities before GA." },
    { title: <>Direct influence on the <span className="emph">roadmap</span></>, icon: "🧭",
      copy: "Your feedback shapes what we ship next." },
    { title: <>Founding-partner <span className="emph">discount</span> at launch</>, icon: "💰",
      copy: "Lock in preferred pricing for Year 1." },
    { title: <>Spotlight case study & <span className="emph">logo</span></>, icon: "🌟",
      copy: "Be featured (optional) in launches and decks." },
  ];

  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold">Why join the beta?</h2>
        <div className="perk-grid mt-4">
          {perks.map((p, i) => <PerkTile key={i} {...p} />)}
        </div>
        <div className="mt-6 text-sm text-muted">
          Limited to <span className="emph">50 teams</span> · <span className="emph">60-day</span> free beta · High-touch onboarding
        </div>
      </div>
    </section>
  );
}

function PerkTile({ title, icon, copy }: Perk){
  const ref = useRef<HTMLDivElement>(null);

  function burst(e: React.MouseEvent<HTMLDivElement>){
    // Respect prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const host = ref.current;
    if (!host) return;
    const box = host.getBoundingClientRect();
    const burstLayer = host.querySelector<HTMLDivElement>(".burst");
    if (!burstLayer) return;

    // create 3 tiny sparks near cursor
    for (let i=0; i<3; i++){
      const s = document.createElement("span");
      s.className = "burst-spark";
      const x = e.clientX - box.left + (Math.random()*12 - 6);
      const y = e.clientY - box.top  + (Math.random()*12 - 6);
      s.style.left = `${x}px`;
      s.style.top  = `${y}px`;
      // random drift vector
      const dx = (Math.random() * 10 + 6) * (Math.random() > .5 ? 1 : -1);
      const dy = -(Math.random() * 12 + 6);
      s.style.setProperty("--dx", `${dx}px`);
      s.style.setProperty("--dy", `${dy}px`);
      burstLayer.appendChild(s);
      s.addEventListener("animationend", () => s.remove());
    }
  }

  return (
    <div
      ref={ref}
      className="perk-tile group"
      onMouseEnter={burst}
      onMouseMove={(e)=> { if (Math.random() < 0.12) burst(e); }}
    >
      <div className="burst" aria-hidden />
      <div className="flex items-start gap-3">
        <span className="perk-icon text-lg" aria-hidden>{icon}</span>
        <div>
          <div className="font-medium">{title}</div>
          <p className="text-sm text-muted mt-1">{copy}</p>
        </div>
      </div>
    </div>
  );
}
