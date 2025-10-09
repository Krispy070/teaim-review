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
        bg:            'hsl(var(--bg))',
        fg:            'hsl(var(--fg))',
        muted:         'hsl(var(--muted))',
        panel:         'hsl(var(--panel))',
        panelc:        'hsl(var(--panel-contrast))',
        border:        'hsl(var(--border))',

        // TEAIM specific theme tokens (HSL format for opacity support)
        'teaim-primary':       'hsl(var(--teaim-primary))',
        'teaim-secondary':     'hsl(var(--teaim-secondary))',
        'teaim-accent':        'hsl(var(--teaim-accent))',

        // Status colors (HSL format for opacity support)
        success:       'hsl(var(--success))',
        warning:       'hsl(var(--warning))',
        error:         'hsl(var(--error))',

        // Raw brand tokens (HSL format for opacity support)
        brand: {
          charcoal: 'hsl(var(--brand-charcoal))',
          orange:   'hsl(var(--brand-orange))',
          yellow:   'hsl(var(--brand-yellow))',
        },

        // Keep existing shadcn tokens for compatibility
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-fg))",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        input: "var(--input)",
        ring: "var(--ring)",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
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
