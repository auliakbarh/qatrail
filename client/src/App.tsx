import { useEffect } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useApolloClient } from "@apollo/client";
import { useAuth } from "./store/auth";
import { ME } from "./graphql";
import { TOKEN_KEY } from "./config";
import { AppShell } from "./components/AppShell";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Analytics from "./pages/Analytics";
import Placeholder from "./pages/Placeholder";
import NotFound from "./pages/NotFound";

function ProtectedLayout() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export default function App() {
  const client = useApolloClient();
  const { setUser, setReady, ready } = useAuth();

  // Bootstrap: resolve the current user from the stored token once at startup.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setReady(true);
      return;
    }
    client
      .query({ query: ME, fetchPolicy: "network-only" })
      .then((res) => setUser(res.data?.me ?? null))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, [client, setUser, setReady]);

  if (!ready) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Placeholder title="Settings" />} />
        <Route path="/help" element={<Placeholder title="Help" />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
