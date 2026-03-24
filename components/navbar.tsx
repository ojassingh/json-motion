import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const GITHUB_URL = "https://github.com/ojassingh/better-motion";

export function Navbar() {
  return (
    <header className="border-border/60 border-b">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6">
        <Link className="flex items-center gap-2 text-sm" href="/">
          <span className="text-muted-foreground/60">▲</span>
          <span className="text-muted-foreground/60">/</span>
          <span className="font-medium">motion</span>
        </Link>
        <nav className="flex items-center gap-0.5">
          <Link
            className={cn(
              buttonVariants({ size: "sm", variant: "ghost" }),
              "text-muted-foreground hover:text-foreground"
            )}
            href="#playground"
          >
            Playground
          </Link>
          <Link
            className={cn(
              buttonVariants({ size: "sm", variant: "ghost" }),
              "text-muted-foreground hover:text-foreground"
            )}
            href="#examples"
          >
            Examples
          </Link>
          <a
            aria-label="Open GitHub repository"
            className={cn(
              buttonVariants({ size: "icon-sm", variant: "ghost" }),
              "text-muted-foreground hover:text-foreground"
            )}
            href={GITHUB_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            <GitHubIcon />
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

function GitHubIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.42-4.04-1.42-.54-1.4-1.34-1.77-1.34-1.77-1.1-.75.09-.73.09-.73 1.21.09 1.85 1.25 1.85 1.25 1.08 1.84 2.82 1.31 3.51 1 .11-.79.42-1.31.76-1.61-2.67-.31-5.47-1.36-5.47-6.02 0-1.33.47-2.42 1.24-3.27-.13-.31-.54-1.56.12-3.25 0 0 1.01-.33 3.3 1.25a11.3 11.3 0 0 1 6 0c2.28-1.58 3.29-1.25 3.29-1.25.66 1.69.25 2.94.12 3.25.77.85 1.24 1.94 1.24 3.27 0 4.67-2.8 5.7-5.48 6 .43.37.82 1.11.82 2.24v3.33c0 .32.22.69.82.58A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}
