import { Clapperboard } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export function Navbar() {
  return (
    <header className="sticky top-0 z-10 border-border/60 border-b bg-background">
      <div className="mx-auto flex h-12 items-center justify-between px-6">
        <Link className="flex items-center gap-2" href="/">
          <Clapperboard className="size-4.5" /> /
          <span className="font-medium tracking-tight">json-motion</span>
        </Link>
        <nav className="flex items-center gap-4 text-muted-foreground text-sm">
          <Link href="/playground">Playground</Link>
          <Link href="#examples">Examples</Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
