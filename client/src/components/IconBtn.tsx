import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { denied } from "../store/toast";

export function IconBtn({
  children,
  title,
  onClick,
  allowed = true,
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
  allowed?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={allowed ? onClick : () => denied()}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted",
        !allowed && "opacity-40",
      )}
    >
      {children}
    </button>
  );
}
