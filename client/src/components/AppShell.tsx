import { type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { LayoutDashboard, BarChart3, Settings, HelpCircle, LogOut, Sun, Moon } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { SidebarTree } from "./SidebarTree";
import { useAuth } from "../store/auth";
import { HEALTH } from "../graphql";
import { UI_VERSION, THEME_KEY } from "../config";
import { cn } from "../lib/utils";
import { useTranslation } from "react-i18next";

const NAV = [
  { to: "/", key: "nav.dashboard", Icon: LayoutDashboard, end: true },
  { to: "/analytics", key: "nav.analytics", Icon: BarChart3, end: false },
  { to: "/settings", key: "nav.settings", Icon: Settings, end: false },
  { to: "/help", key: "nav.help", Icon: HelpCircle, end: false },
];

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

  const initials = (user?.name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const switchLang = () => {
    const next = i18n.language === "en" ? "id" : "en";
    void i18n.changeLanguage(next);
    localStorage.setItem("qar_lang", next);
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="flex h-12 items-center gap-2 border-b border-border px-3">
          <span className="h-4 w-4 rounded bg-primary" />
          <span className="text-sm font-semibold">{t("app")}</span>
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {NAV.map(({ to, key, Icon, end }) => (
            <div key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded px-2 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {t(key)}
              </NavLink>
              {to === "/" && <SidebarTree />}
            </div>
          ))}
        </nav>
        <div className="flex items-center gap-2 border-t border-border p-2">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-muted text-xs font-semibold">
            {initials}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-xs font-semibold">{user?.name}</div>
            <div className="text-xs text-muted-foreground">{user?.role}</div>
          </div>
          <button
            onClick={toggleTheme}
            className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted"
            title="Toggle theme"
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
          <span>UI v{UI_VERSION} · API v{data?.health?.apiVersion ?? "…"}</span>
          <button onClick={switchLang} className="uppercase hover:text-foreground">
            {i18n.language}
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
