export function isBrandV2(): boolean {
  // Always use Brand V2 (new UI layout) for improved user experience
  return true;
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