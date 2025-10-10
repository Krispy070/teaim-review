export type ThemePreference = "light" | "dark" | "system";
export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "teaim.theme";
const LEGACY_STORAGE_KEY = "teaim_theme";
const WINDOW_STATE_KEY = "__TEAIM_THEME__";

type ThemeSnapshot = {
  preference: ThemePreference;
  resolved: ThemeMode;
};

const defaultSnapshot: ThemeSnapshot = {
  preference: "system",
  resolved: "light",
};

const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

function prefersDark(): ThemeMode {
  if (!isBrowser || !window.matchMedia) {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(preference: ThemePreference): ThemeMode {
  return preference === "system" ? prefersDark() : preference;
}

function applyDataset(mode: ThemeMode) {
  if (!isBrowser) return;
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.classList.toggle("dark", mode === "dark");
  try {
    root.style.colorScheme = mode;
  } catch {
    // noop
  }
}

export function applyTheme(mode: ThemeMode) {
  applyDataset(mode);
}

export function readStoredPreference(): ThemePreference {
  if (!isBrowser) return "system";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY) as ThemePreference | null;
    if (legacy === "light" || legacy === "dark") {
      return legacy;
    }
  } catch {
    // ignore storage errors (Safari private mode, etc.)
  }
  return "system";
}

function persistPreference(preference: ThemePreference) {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // ignore
  }
}

function snapshot(preference: ThemePreference, resolved: ThemeMode) {
  if (!isBrowser) return;
  (window as typeof window & { [WINDOW_STATE_KEY]?: ThemeSnapshot })[
    WINDOW_STATE_KEY
  ] = { preference, resolved };
}

export function initTheme(): ThemeSnapshot {
  if (!isBrowser) {
    return defaultSnapshot;
  }

  const preference = readStoredPreference();
  const resolved = resolveTheme(preference);
  applyTheme(resolved);
  snapshot(preference, resolved);
  return { preference, resolved };
}

export function setThemePreference(preference: ThemePreference): ThemeMode {
  const resolved = resolveTheme(preference);
  persistPreference(preference);
  applyTheme(resolved);
  snapshot(preference, resolved);
  return resolved;
}

export function getThemeSnapshot(): ThemeSnapshot {
  if (!isBrowser) return defaultSnapshot;
  const state = (window as typeof window & { [WINDOW_STATE_KEY]?: ThemeSnapshot })[
    WINDOW_STATE_KEY
  ];
  if (state) return state;
  return initTheme();
}

export function subscribeToSystemTheme(callback: (mode: ThemeMode) => void) {
  if (!isBrowser || !window.matchMedia) {
    return () => {};
  }

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (event: MediaQueryListEvent | MediaQueryList) => {
    const target = "matches" in event ? event.matches : media.matches;
    callback(target ? "dark" : "light");
  };

  handler(media);

  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }

  // Safari < 14 fallback
  media.addListener(handler);
  return () => media.removeListener(handler);
}
