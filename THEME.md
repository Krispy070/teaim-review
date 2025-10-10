# TEAIM Theme System

This project ships a first-class light/dark theme with TEAIM brand colors. All UI surfaces
should consume the shared CSS variables that are applied to the `<html>` element via the
`ThemeProvider` (`client/src/contexts/ThemeContext.tsx`). The active theme is reflected by
`document.documentElement.dataset.theme` (`"light"` | `"dark"`). The toggle cycles between
`dark → light → system` and persists the preference in `localStorage` under `teaim.theme`.

## Core tokens

CSS variables defined in `client/src/styles/theme.css` are the source of truth. Key tokens:

| Token | Light | Dark |
| --- | --- | --- |
| `--brand-bg` | `#ffffff` | `#111318` |
| `--brand-surface` | `#f4f6fb` | `#0d0f12` |
| `--brand-card-bg` | `#ffffff` | `#050608` |
| `--brand-card-border` | `rgba(17,19,24,0.12)` | `rgba(255,255,255,0.20)` |
| `--brand-fg` | `#111318` | `#ffffff` |
| `--brand-muted` | `#4b5563` | `#9aa3af` |
| `--accent` | `#ff7a00` (brand orange) | same |
| `--accent-2` | `#ffd166` (brand yellow) | same |
| `--ring` | `rgba(255,122,0,0.45)` | `rgba(255,122,0,0.58)` |
| `--focus` | `rgba(255,209,102,0.40)` | `rgba(255,209,102,0.50)` |

Additional semantic tokens (`--success`, `--warn`, `--error`, sidebar colors, etc.) live in the
same file and power Tailwind utilities via `tailwind.config.ts`.

## Dark-surface rules

Dark UI contexts **must not** use solid white cards. Instead rely on the shared card
variables/classes:

- Cards and tiles: `className="brand-card"` or `className="teaim-surface"` → resolves to
  `background: #050608`, `border: 1px solid rgba(255,255,255,0.2)`, `color: #ffffff`,
  `box-shadow: 0 18px 40px rgba(0,0,0,0.6)`.
- Inputs: `className="teaim-input"` gives `background: var(--input)` (`#050608` in dark),
  `border: rgba(255,255,255,0.2)`, `color: #fff`, `focus` ring in brand orange.
- CTA buttons: `className="teaim-cta"` for the solid orange primary; ghost variant
  `teaim-cta-ghost` uses transparent background with orange border.

Where Tailwind utilities are needed, prefer variables (`bg-[var(--brand-card-bg)]`,
`text-[var(--brand-fg)]`, `border-[var(--brand-card-border)]`, etc.) so the component stays theme
aware.

## Adding new components or tokens

1. **Import tokens:** Tailwind already exposes the variables as semantic colors. Prefer using
   classes like `bg-background`, `text-foreground`, `border-border`, `bg-brand-surface`, etc.
2. **Need a new token?** Add it to `client/src/styles/theme.css`, then surface it in
   `tailwind.config.ts` under `theme.extend.colors` so it can be used via Tailwind utilities.
3. **Component classes:** If you create a reusable primitive, add a named class in
   `client/src/index.css` or `client/src/brand/tokens.css` that applies the variables instead of
   duplicating literal colors.
4. **Focus states:** Always rely on `var(--focus)`/`var(--ring)` for focus rings to preserve
   accessibility contrast.
5. **Testing:** Update the Playwright smoke test (`tests/smoke/theme-navigation.spec.ts`) if your
   changes impact the theme toggle, navigation count, or other global behaviours.

By standardising on these tokens the app keeps TEAIM’s solid-dark branding while supporting light
mode and system preferences with minimal effort.
