import { useState, useCallback, useRef } from "react";

export function useBusy() {
  const [busy, setBusy] = useState(false);
  const inflightRef = useRef<Promise<any> | null>(null);

  const withBusy = useCallback(async <T>(fn: () => Promise<T>): Promise<T> => {
    if (inflightRef.current) {
      return inflightRef.current;
    }
    
    setBusy(true);
    const promise = (async () => {
      try {
        return await fn();
      } finally {
        setBusy(false);
        inflightRef.current = null;
      }
    })();
    
    inflightRef.current = promise;
    return promise;
  }, []);

  return { busy, withBusy };
}
