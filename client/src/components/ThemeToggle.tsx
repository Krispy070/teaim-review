import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

const icons = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

function labelFor(preference: "light" | "dark" | "system") {
  switch (preference) {
    case "dark":
      return "Dark";
    case "light":
      return "Light";
    default:
      return "System";
  }
}

const nextPreferenceMap: Record<"light" | "dark" | "system", "light" | "dark" | "system"> = {
  dark: "light",
  light: "system",
  system: "dark",
};

export function ThemeToggle({ className }: { className?: string }) {
  const { preference, resolved, cyclePreference } = useTheme();
  const Icon = icons[preference];
  const next = nextPreferenceMap[preference];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={cyclePreference}
          data-testid="theme-toggle"
          aria-label={`Theme: ${labelFor(preference)}. Next: ${labelFor(next)}.`}
          className={cn(
            "h-9 w-9 rounded-full border border-border/60 bg-transparent text-[var(--text-muted)] transition-colors",
            resolved === "dark" && "text-[var(--brand-fg)]",
            "hover:bg-[var(--brand-card-bg)] hover:text-[var(--brand-fg)] focus-visible:ring-2 focus-visible:ring-ring",
            className
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center" className="text-xs">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">Theme: {labelFor(preference)}</span>
          <span className="text-muted-foreground">Next: {labelFor(next)}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export default ThemeToggle;
