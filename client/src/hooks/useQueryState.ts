import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

export default function useQueryState(
  key: string,
  initial = ""
): [string, (v: string) => void] {
  const [location, setLocation] = useLocation();
  const params = useMemo(() => new URLSearchParams(location.split('?')[1] || ''), [location]);

  const [state, setState] = useState(params.get(key) ?? initial);

  useEffect(() => {
    setState(params.get(key) ?? initial);
  }, [location, key, initial, params]);

  const set = useCallback((v: string) => {
    const currentPath = location.split('?')[0];
    const p = new URLSearchParams(location.split('?')[1] || '');
    if (v && v !== initial) p.set(key, v); else p.delete(key);
    const search = p.toString();
    setLocation(currentPath + (search ? `?${search}` : ''), { replace: true });
  }, [key, initial, setLocation, location]);

  return [state, set];
}
