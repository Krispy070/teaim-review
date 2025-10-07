import { useEffect } from "react";
import { useLocation } from "wouter";

export default function useScrollRestore(containerId = "app-scroll") {
  const [pathname] = useLocation();
  const key = pathname;

  useEffect(() => {
    const el = document.getElementById(containerId);
    if (!el) return;
    const saved = sessionStorage.getItem("scroll:" + key);
    if (saved) el.scrollTo({ top: Number(saved), behavior: "instant" as any });
    const onScroll = () => sessionStorage.setItem("scroll:" + key, String(el.scrollTop));
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [key, containerId]);
}
