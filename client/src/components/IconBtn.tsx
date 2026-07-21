import type { ReactNode } from "react";

export function IconBtn({
  children,
  title,
  onClick,
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted"
    >
      {children}
    </button>
  );
}
