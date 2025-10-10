import type { Config } from "tailwindcss";

export default {
  darkMode: ['class', '[data-theme="dark"]'], // support both strategies
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "var(--brand-bg)",
        foreground: "var(--brand-fg)",
        border: "var(--brand-border)",
        ring: "var(--ring)",
        input: "var(--input)",
        muted: {
          DEFAULT: "var(--brand-surface)",
          foreground: "var(--brand-muted)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        "accent-2": {
          DEFAULT: "var(--accent-2)",
          foreground: "var(--accent-foreground)",
        },
        primary: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        secondary: {
          DEFAULT: "var(--brand-surface)",
          foreground: "var(--brand-fg)",
        },
        card: {
          DEFAULT: "var(--brand-card-bg)",
          foreground: "var(--brand-fg)",
        },
        popover: {
          DEFAULT: "var(--brand-surface-contrast)",
          foreground: "var(--brand-fg)",
        },
        destructive: {
          DEFAULT: "var(--error)",
          foreground: "var(--brand-fg)",
        },
        success: "var(--success)",
        warning: "var(--warn)",
        error: "var(--error)",
        brand: {
          bg: "var(--brand-bg)",
          surface: "var(--brand-surface)",
          surfaceDark: "var(--brand-surface-dark)",
          fg: "var(--brand-fg)",
          muted: "var(--brand-muted)",
          accent: "var(--accent)",
          accent2: "var(--accent-2)",
          border: "var(--brand-border)",
        },
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
        },
      },
      boxShadow: {
        focus: "0 0 0 3px var(--focus)",
      },
      borderColor: {
        DEFAULT: "var(--brand-border)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
