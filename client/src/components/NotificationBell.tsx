import { useState } from "react";
import { useQuery, useMutation, useSubscription } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bell } from "lucide-react";
import {
  NOTIFICATIONS,
  MARK_NOTIFICATION_READ,
  MARK_ALL_READ,
  NOTIFICATION_ADDED,
} from "../graphql/workflow";
import { cn, fmtDateTime as fmt } from "../lib/utils";

export function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data, refetch } = useQuery(NOTIFICATIONS, { fetchPolicy: "cache-and-network" });
  const [markRead] = useMutation(MARK_NOTIFICATION_READ);
  const [markAll] = useMutation(MARK_ALL_READ);

  // Live updates: refetch on each pushed notification.
  useSubscription(NOTIFICATION_ADDED, { onData: () => void refetch() });

  const [unreadOnly, setUnreadOnly] = useState(false);
  const all = data?.notifications ?? [];
  const items = unreadOnly ? all.filter((n: any) => !n.read) : all;
  const unread = data?.unreadCount ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted"
        title={t("c.notifications")}
      >
        <Bell className="h-3.5 w-3.5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed left-2 top-12 z-50 max-h-[80vh] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto rounded border border-border bg-background shadow-md">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-semibold">{t("c.notifications")}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setUnreadOnly((v) => !v)}
                  className="text-xs text-primary underline underline-offset-2"
                >
                  {unreadOnly ? t("notif.showAll") : t("notif.showUnread")}
                </button>
                {unread > 0 && (
                  <button
                    onClick={() => markAll().then(() => refetch())}
                    className="text-xs text-primary underline underline-offset-2"
                  >
                    {t("notif.markAll")}
                  </button>
                )}
              </div>
            </div>
            {items.length === 0 && (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">{t("notif.empty")}</div>
            )}
            {items.map((n: any) => (
              <button
                key={n.id}
                onClick={async () => {
                  await markRead({ variables: { id: n.id } });
                  await refetch();
                  setOpen(false);
                  if (n.appTestId) navigate(`/app-tests/${n.appTestId}`);
                  else if (n.userTestId) navigate(`/user-tests/${n.userTestId}`);
                  else if (n.issueId) navigate(`/issues/${n.issueId}`);
                }}
                className={cn(
                  "block w-full border-b border-border/50 px-3 py-2 text-left last:border-0 hover:bg-muted/40",
                  !n.read && "bg-muted/30",
                )}
              >
                <div className="flex items-center gap-1.5">
                  {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {n.kind.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="text-xs">{n.message}</div>
                <div className="text-[10px] text-muted-foreground">{fmt(n.createdAt)}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
