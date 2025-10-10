import { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  ThemeMode,
  ThemePreference,
  getThemeSnapshot,
  setThemePreference,
  subscribeToSystemTheme,
} from "@/lib/theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ThemeMode;
  setPreference: (preference: ThemePreference) => void;
  cyclePreference: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const cycleOrder: ThemePreference[] = ["dark", "light", "system"];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const initial = getThemeSnapshot();
  const [preference, setPreference] = useState<ThemePreference>(initial.preference);
  const [resolved, setResolved] = useState<ThemeMode>(initial.resolved);

  useEffect(() => {
    const mode = setThemePreference(preference);
    setResolved(mode);

    if (preference !== "system") {
      return;
    }

    const unsubscribe = subscribeToSystemTheme((systemMode) => {
      setResolved(systemMode);
      setThemePreference("system");
    });

    return unsubscribe;
  }, [preference]);

  const value = useMemo<ThemeContextValue>(() => {
    const cyclePreference = () => {
      setPreference((prev) => {
        const currentIndex = cycleOrder.indexOf(prev);
        const next = cycleOrder[(currentIndex + 1) % cycleOrder.length];
        return next;
      });
    };

    const updatePreference = (next: ThemePreference) => {
      setPreference(next);
    };

    return {
      preference,
      resolved,
      cyclePreference,
      setPreference: updatePreference,
    };
  }, [preference, resolved]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
