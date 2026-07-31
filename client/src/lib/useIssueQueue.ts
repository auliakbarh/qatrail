import { useState } from "react";
import { useNav } from "../store/nav";

// A bulk run leaves one issue to raise per FAIL. This walks the normal issue form
// over them: open the first, then each time that form finishes — saved or
// cancelled — move to the next, and close the panel when none are left.
// An empty queue behaves exactly like a plain close, so callers can wire `next`
// into the issue form unconditionally.
export function useIssueQueue() {
  const { openPanel, closePanel } = useNav();
  const [queue, setQueue] = useState<any[]>([]);

  const start = (prefills: any[]) => {
    const [head, ...rest] = prefills;
    setQueue(rest);
    if (head) openPanel({ kind: "issue", mode: "create", initial: head });
    else closePanel();
  };

  return { start, next: () => start(queue) };
}
