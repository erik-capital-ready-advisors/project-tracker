"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const ORDER = ["system", "light", "dark"] as const;
type ThemeName = (typeof ORDER)[number];

const ICON: Record<ThemeName, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // The resolved theme is not known during SSR, so rendering the real icon on
  // the server guarantees a hydration mismatch. Reserve the space instead.
  useEffect(() => setMounted(true), []);

  const current = (ORDER as readonly string[]).includes(theme ?? "")
    ? (theme as ThemeName)
    : "system";
  const Icon = ICON[current];
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Theme: ${current}. Switch to ${next}.`}
      data-verify-unit="theme-toggle"
      data-verify-theme={mounted ? current : "pending"}
      onClick={() => setTheme(next)}
    >
      {mounted ? <Icon className="size-4" /> : <span className="size-4" />}
    </Button>
  );
}
