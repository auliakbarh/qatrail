import { cn } from "../lib/utils";

// The one status pill. Status text is always UPPERCASE — the values are enums
// (PASSED, IN_REVIEW, DEFECT), and the translated ones (Active, In testing) read
// as the same kind of thing only if they look like it. Three pages used to keep
// a private copy of this; they all import this one now.
export type BadgeVariant = "muted" | "primary" | "destructive" | "outline" | "warn";

const VARIANTS: Record<BadgeVariant, string> = {
  muted: "bg-muted text-muted-foreground",
  primary: "bg-primary text-primary-foreground",
  destructive: "bg-destructive text-white",
  outline: "border border-border text-muted-foreground",
  warn: "bg-[var(--warn)]/15 text-[var(--warn)]",
};

export function Badge({
  children,
  variant = "muted",
  className = "",
  title,
}: {
  children: any;
  variant?: BadgeVariant;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium uppercase",
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
