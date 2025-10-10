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
        // TEAIM semantic theme tokens (HSL format for opacity support)
        bg:            'hsl(var(--bg, 224 41% 7%))',
        fg:            'hsl(var(--fg, 220 22% 92%))',
        muted:         'hsl(var(--muted, 217 11% 67%))',
        panel:         'hsl(var(--panel, 222 36% 11%))',
        panelc:        'hsl(var(--panel-contrast, 222 30% 16%))',
        border:        'hsl(var(--border, 222 24% 20%))',

        // TEAIM specific theme tokens (HSL format for opacity support)
        'teaim-primary':       'hsl(var(--teaim-primary, 36 100% 50%))',
        'teaim-secondary':     'hsl(var(--teaim-secondary, 42 100% 70%))',
        'teaim-accent':        'hsl(var(--teaim-accent, 36 100% 50%))',

        // Status colors (HSL format for opacity support)
        success:       'hsl(var(--success, 148 60% 44%))',
        warning:       'hsl(var(--warning, 36 100% 50%))',
        error:         'hsl(var(--error, 5 80% 56%))',

        // Raw brand tokens (HSL format for opacity support)
        brand: {
          charcoal: 'var(--brand-charcoal, #0b0f1a)',
          orange:   'var(--brand-orange, #ff9900)',
          yellow:   'var(--brand-yellow, #ffd166)',
        },

        // Keep existing shadcn tokens for compatibility
        background: "var(--background, #0b0f1a)",
        foreground: "var(--foreground, #e6e9ef)",
        primary: {
          DEFAULT: "hsl(var(--primary, 36 100% 50%))",
          foreground: "hsl(var(--primary-fg, 224 41% 7%))",
        },
        card: {
          DEFAULT: "var(--card, #121826)",
          foreground: "var(--card-foreground, #e6e9ef)",
        },
        popover: {
          DEFAULT: "var(--popover, #1a2333)",
          foreground: "var(--popover-foreground, #e6e9ef)",
        },
        secondary: {
          DEFAULT: "var(--secondary, #1a2333)",
          foreground: "var(--secondary-foreground, #e6e9ef)",
        },
        muted: {
          DEFAULT: "var(--muted, #1a2333)",
          foreground: "var(--muted-foreground, #a1a8b3)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent, 42 100% 70%))",
          foreground: "hsl(var(--accent-foreground, 224 41% 7%))",
        },
        destructive: {
          DEFAULT: "var(--destructive, #f25f5c)",
          foreground: "var(--destructive-foreground, #0b0f1a)",
        },
        input: "var(--input, #1a2333)",
        ring: "var(--ring, rgba(255, 153, 0, 0.45))",
        chart: {
          "1": "var(--chart-1, #ff9900)",
          "2": "var(--chart-2, #ffd166)",
          "3": "var(--chart-3, #3dd2a2)",
          "4": "var(--chart-4, #5c7cfa)",
          "5": "var(--chart-5, #f25f5c)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar-background)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
      },
      boxShadow: {
        focus: '0 0 0 3px var(--ring)',
      },
      borderColor: {
        DEFAULT: 'var(--border)',
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
