// theme.ts
export function setTheme(mode: 'light'|'dark') {
  const root = document.documentElement;
  if (mode === 'dark') {
    root.setAttribute('data-theme', 'dark');
    root.classList.add('dark');
  } else {
    root.removeAttribute('data-theme');
    root.classList.remove('dark');
  }
  localStorage.setItem('teaim_theme', mode);
}

export function getTheme(): 'light' | 'dark' {
  const saved = localStorage.getItem('teaim_theme') as 'light'|'dark';
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return saved || (prefersDark ? 'dark' : 'light');
}

export function initTheme() {
  const theme = getTheme();
  setTheme(theme);
}

export function toggleTheme() {
  const current = getTheme();
  setTheme(current === 'dark' ? 'light' : 'dark');
}