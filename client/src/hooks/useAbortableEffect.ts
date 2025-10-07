import { useEffect, useRef } from "react";

export function useAbortableEffect(
  effect: (signal: AbortSignal) => void | (() => void),
  deps: React.DependencyList
) {
  const cleanupRef = useRef<(() => void) | void>();

  useEffect(() => {
    const controller = new AbortController();
    cleanupRef.current = effect(controller.signal);

    return () => {
      controller.abort();
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, deps);
}
