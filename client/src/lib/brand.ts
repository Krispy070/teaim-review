export function isBrandV2(): boolean {
  // Check if running in browser context
  if (typeof localStorage === "undefined") return true;
  
  // Read from localStorage, default to Brand V2 (true) if not set
  const stored = localStorage.getItem("kap.brandv2");
  return stored === null ? true : stored === "1";
}

export function setBrandV2(on: boolean) {
  localStorage.setItem("kap.brandv2", on ? "1" : "0");
  // Re-apply the class and hard refresh to avoid half-applied styles
  applyBrandClass();
  location.reload();
}

export function applyBrandClass() {
  if (typeof document === "undefined") return;
  const on = isBrandV2();
  document.documentElement.classList.toggle("brand-v2", on);
}