import { useRef } from "react";

export function BurstTile({
  className = "",
  children,
  "data-testid": dataTestId,
}: { className?: string; children: React.ReactNode; "data-testid"?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  function burst(e: React.MouseEvent<HTMLDivElement>) {
    const host = ref.current;
    if (!host) return;
    const box = host.getBoundingClientRect();
    const layer = host.querySelector<HTMLDivElement>(".burst");
    if (!layer) return;

    for (let i = 0; i < 3; i++) {
      const s = document.createElement("span");
      s.className = "burst-spark";
      const x = e.clientX - box.left + (Math.random() * 12 - 6);
      const y = e.clientY - box.top + (Math.random() * 12 - 6);
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      const dx = (Math.random() * 10 + 6) * (Math.random() > 0.5 ? 1 : -1);
      const dy = -(Math.random() * 12 + 6);
      s.style.setProperty("--dx", `${dx}px`);
      s.style.setProperty("--dy", `${dy}px`);
      layer.appendChild(s);
      s.addEventListener("animationend", () => s.remove());
    }
  }

  return (
    <div
      ref={ref}
      className={className}
      data-testid={dataTestId}
      onMouseEnter={burst}
      onMouseMove={(e) => { if (Math.random() < 0.12) burst(e); }}
    >
      <div className="burst" aria-hidden />
      {children}
    </div>
  );
}
