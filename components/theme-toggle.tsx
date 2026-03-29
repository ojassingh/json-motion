"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { setTheme } = useTheme();

  return (
    <>
      <Button
        className="dark:hidden"
        onClick={() => setTheme("dark")}
        type="button"
        variant="outline"
      >
        <Moon />
      </Button>
      <Button
        className="hidden dark:block dark:bg-background"
        onClick={() => setTheme("light")}
        type="button"
        variant="outline"
      >
        <Sun />
      </Button>
    </>
  );
}
