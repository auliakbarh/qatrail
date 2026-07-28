import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { LayoutDashboard, BarChart3, Settings, HelpCircle, LogOut, Sun, Moon, ListChecks, Inbox, Smartphone, KeyRound, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { SidebarTree } from "./SidebarTree";
import { useNav } from "../store/nav";
import { useAuth } from "../store/auth";
import { HEALTH } from "../graphql";
import { UI_VERSION, THEME_KEY } from "../config";
import { cn } from "../lib/utils";
import { useTranslation } from "react-i18next";

function toggleTheme() {
  const el = document.documentElement;
  const dark = el.classList.toggle("dark");
  localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { data } = useQuery(HEALTH, { fetchPolicy: "cache-first" });
  const apiVersion: string | undefined = data?.health?.apiVersion;

  // Sidebar collapse: minimized to an icon rail; hovering reveals it temporarily.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("qar_sidebar") === "1");
  const [hovered, setHovered] = useState(false);
  const expanded = !collapsed || hovered;
  const toggleCollapse = () => {
    setCollapsed((c) => {
      const n = !c;
      localStorage.setItem("qar_sidebar", n ? "1" : "0");
      return n;
    });
    setHovered(false);
  };

  const ROLE_SHORT: Record<string, string> = {
    SUPER_ADMIN: "SA",
    ADMIN: "A",
    QA: "QA",
    ENGINEER: "EN",
    VIEWER: "V",
  };
  const roleShort = ROLE_SHORT[user?.role ?? ""] ?? "?";

  const switchLang = () => {
    const next = i18n.language === "en" ? "id" : "en";
    void i18n.changeLanguage(next);
    localStorage.setItem("qar_lang", next);
  };

  return (
    <div className="relative flex h-screen bg-background text-foreground">
      {/* Placeholder keeps main from reflowing while the collapsed rail expands on hover. */}
      {collapsed && <div className="w-14 shrink-0" />}
      <aside
        onMouseEnter={() => collapsed && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "flex shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-150",
          collapsed
            ? hovered
              ? "absolute left-0 top-0 z-40 h-full w-56 shadow-xl"
              : "absolute left-0 top-0 z-40 h-full w-14"
            : "w-56",
        )}
      >
        <div className={cn("flex h-12 items-center gap-2 border-b border-border", expanded ? "px-3" : "justify-center px-1")}>
          {expanded && <span className="text-sm font-semibold">{t("app")}</span>}
          <div className={cn("flex items-center gap-1", expanded && "ml-auto")}>
            {expanded && <NotificationBell />}
            <button
              onClick={toggleCollapse}
              className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted"
              title={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
            >
              {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {[
            { to: "/", label: t("nav.dashboard"), Icon: LayoutDashboard, end: true, tree: true },
            { to: "/app-tests", label: t("nav.appTests"), Icon: Smartphone, end: false, tree: false },
            { to: "/user-tests", label: t("nav.userTests"), Icon: KeyRound, end: false, tree: false },
            { to: "/issues", label: t("nav.allIssues"), Icon: ListChecks, end: true, tree: false },
            ...(user?.role === "ENGINEER"
              ? [{ to: "/assigned", label: t("nav.assigned"), Icon: Inbox, end: true, tree: false }]
              : []),
            { to: "/analytics", label: t("nav.analytics"), Icon: BarChart3, end: false, tree: false },
            { to: "/settings", label: t("nav.settings"), Icon: Settings, end: false, tree: false },
            { to: "/help", label: t("nav.help"), Icon: HelpCircle, end: false, tree: false },
          ].map(({ to, label, Icon, end, tree }) => (
            <div key={to}>
              <NavLink
                to={to}
                end={end}
                // Dashboard always lands on the full project list, not the last drilldown.
                onClick={() => { if (to === "/") useNav.getState().selectProject(null); }}
                title={expanded ? undefined : label}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded px-2 py-1.5 text-sm font-medium transition-colors",
                    !expanded && "justify-center",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {expanded && label}
              </NavLink>
              {tree && expanded && <SidebarTree />}
            </div>
          ))}
        </nav>
        {expanded && (
          <>
            <div className="flex items-center gap-2 border-t border-border p-2">
              <span className="group relative shrink-0">
                <span className="flex h-7 w-7 cursor-default items-center justify-center rounded bg-muted text-[10px] font-semibold">
                  {roleShort}
                </span>
                <span className="pointer-events-none absolute bottom-full left-0 z-50 mb-1 hidden whitespace-nowrap rounded border border-border bg-background px-2 py-1 text-[10px] font-medium text-foreground shadow-md group-hover:block">
                  {user?.role}
                </span>
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-xs font-semibold">{user?.name}</div>
              </div>
              <button
                onClick={toggleTheme}
                className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted"
                title={t("c.toggleTheme")}
              >
                <Sun className="h-3.5 w-3.5 dark:hidden" />
                <Moon className="hidden h-3.5 w-3.5 dark:block" />
              </button>
              <button
                onClick={() => {
                  signOut();
                  navigate("/login");
                }}
                className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted"
                title={t("logout")}
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
              {/* Both versions come from the same release tag, so a mismatch means one side is stale. */}
              <span
                className={apiVersion && apiVersion !== UI_VERSION ? "text-[var(--warn)]" : undefined}
                title={apiVersion && apiVersion !== UI_VERSION ? t("health.mismatch") : undefined}
              >
                UI v{UI_VERSION} · API v{apiVersion ?? "…"}
              </span>
              <button onClick={switchLang} className="uppercase hover:text-foreground">
                {i18n.language}
              </button>
            </div>
          </>
        )}
      </aside>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
