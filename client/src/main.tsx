import React from "react";
import ReactDOM from "react-dom/client";
import { ApolloProvider } from "@apollo/client";
import { BrowserRouter } from "react-router-dom";
import { apollo } from "./apollo";
import App from "./App";
import "./i18n";
import "./index.css";
import { THEME_KEY } from "./config";

// Env-tinted favicon so dev/staging/prod tabs are distinguishable at a glance.
// Staging & prod are both `production` builds, so use VITE_APP_ENV to tell them
// apart; fall back to Vite's MODE (dev). Set VITE_APP_ENV=staging on staging.
const APP_ENV = import.meta.env.VITE_APP_ENV || import.meta.env.MODE;
const ENV_COLOR: Record<string, string> = { development: "#f59e0b", staging: "#7c3aed", production: "#1a1a1a" };
const bg = ENV_COLOR[APP_ENV] ?? ENV_COLOR.production;
if (bg !== ENV_COLOR.production) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${bg}"/><path d="M9 16.5l4.5 4.5L23 11" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  document.title = `[${APP_ENV.toUpperCase()}] ${document.title}`;
}

// Apply saved theme (or OS preference) before first paint.
const savedTheme = localStorage.getItem(THEME_KEY);
if (savedTheme === "dark" || (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
  document.documentElement.classList.add("dark");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ApolloProvider client={apollo}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ApolloProvider>
  </React.StrictMode>,
);
