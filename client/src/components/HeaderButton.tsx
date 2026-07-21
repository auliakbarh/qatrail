import type { ComponentType, ReactNode } from "react";
import { cn } from "../lib/utils";
import { denied } from "../store/toast";

// Dark "Add …" header action. When not allowed it looks disabled but stays
// clickable and shows a permission toast (server remains the real gate).
export function HeaderButton({
  children,
  onClick,
  allowed = true,
  icon: Icon,
}: {
  children: ReactNode;
  onClick: () => void;
  allowed?: boolean;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <button
      onClick={allowed ? onClick : () => denied()}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded bg-black px-3 text-xs font-medium text-white hover:bg-black/80",
        !allowed && "opacity-40",
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}
