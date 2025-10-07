import { useEffect, useState } from "react";

export default function ImgLogo({
  src, alt, className, timeoutMs=3000
}: { src: string; alt: string; className?: string; timeoutMs?: number }) {
  const [ok, setOk] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(()=>{
    let isMounted = true;
    
    // Use a simpler approach with just a timeout - no fetch, no AbortController
    const timeout = setTimeout(() => {
      if (isMounted) {
        // Try loading the image via Image() API which doesn't cause unhandled rejections
        const img = new Image();
        img.onload = () => {
          if (isMounted) {
            setOk(true);
          }
        };
        img.onerror = () => {
          if (isMounted) {
            setOk(false);
          }
        };
        img.src = src;
      }
    }, 100); // Small delay to let component mount
    
    // Fallback timeout
    const fallbackTimeout = setTimeout(() => {
      if (isMounted) {
        setOk(false);
      }
    }, timeoutMs);
    
    return () => { 
      isMounted = false;
      clearTimeout(timeout);
      clearTimeout(fallbackTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, tick]);

  if (!ok) return null;
  return (
    <img
      src={`${src}&v=${tick}`} alt={alt} className={className}
      loading="lazy"
      onError={()=>{ setOk(false); }}
      onLoad={()=>{ /* noop */ }}
    />
  );
}