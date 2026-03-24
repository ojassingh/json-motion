"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => {
        setTheme(isDark ? "light" : "dark");
      }}
      type="button"
      variant="outline"
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
