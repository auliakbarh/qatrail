import { useEffect } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useApolloClient, useQuery } from "@apollo/client";
import { useAuth } from "./store/auth";
import { ME, HEALTH } from "./graphql";
import { TOKEN_KEY } from "./config";
import { AppShell } from "./components/AppShell";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import IssuePage from "./pages/IssuePage";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import Help from "./pages/Help";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ForcePasswordChange from "./pages/ForcePasswordChange";
import Maintenance from "./pages/Maintenance";
import NotFound from "./pages/NotFound";

function ProtectedLayout() {
  const { user, ready } = useAuth();
  const { data } = useQuery(HEALTH, { fetchPolicy: "cache-and-network" });
  if (!ready) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  // Forced first-login password change.
  if (user.mustChangePassword) return <ForcePasswordChange />;
  // Maintenance: non-admins are locked out (only logout).
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  if (data?.health?.maintenance && !isAdmin) return <Maintenance message={data.health.maintenanceMessage} />;
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
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/issues/:id" element={<IssuePage />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/help" element={<Help />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
