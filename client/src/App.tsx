import { useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useApolloClient, useQuery } from "@apollo/client";
import { useAuth } from "./store/auth";
import { ME, HEALTH } from "./graphql";
import { TOKEN_KEY } from "./config";
import { AppShell } from "./components/AppShell";
import Login from "./pages/Login";
import ForcePasswordChange from "./pages/ForcePasswordChange";
import Maintenance from "./pages/Maintenance";
import { Toaster } from "./components/Toaster";

// Route-split: each of these becomes its own chunk, loaded on first visit.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AppTests = lazy(() => import("./pages/AppTests"));
const AppTestDetail = lazy(() => import("./pages/AppTestDetail"));
const UserTests = lazy(() => import("./pages/UserTests"));
const SessionTests = lazy(() => import("./pages/SessionTests"));
const SessionTestDetail = lazy(() => import("./pages/SessionTestDetail"));
const UserTestDetail = lazy(() => import("./pages/UserTestDetail"));
const IssuePage = lazy(() => import("./pages/IssuePage"));
const TestCasePage = lazy(() => import("./pages/TestCasePage"));
const PendingTestCases = lazy(() => import("./pages/PendingTestCases"));
const AllIssues = lazy(() => import("./pages/AllIssues"));
const AssignedToMe = lazy(() => import("./pages/AssignedToMe"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));
const Help = lazy(() => import("./pages/Help"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const HealthPage = lazy(() => import("./pages/HealthPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const Loading = <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

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
    <>
      <Toaster />
      <Suspense fallback={Loading}>
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/health" element={<HealthPage />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />
      <Route element={<ProtectedLayout />}>
        {/* Hierarchy drilldown — one page, one route per depth, state in the URL. */}
        <Route path="/" element={<Dashboard />} />
        <Route path="/projects/:projectId" element={<Dashboard />} />
        <Route path="/projects/:projectId/features/:featureId" element={<Dashboard />} />
        <Route path="/projects/:projectId/features/:featureId/test-cases/:testCaseId" element={<Dashboard />} />
        <Route path="/projects/:projectId/features/:featureId/test-cases/:testCaseId/issues/:issueId" element={<Dashboard />} />
        <Route path="/app-tests" element={<AppTests />} />
        <Route path="/app-tests/:id" element={<AppTestDetail />} />
        <Route path="/user-tests" element={<UserTests />} />
        <Route path="/user-tests/:id" element={<UserTestDetail />} />
        <Route path="/session-tests" element={<SessionTests />} />
        <Route path="/session-tests/:id" element={<SessionTestDetail />} />
        <Route path="/issues" element={<AllIssues />} />
        <Route path="/assigned" element={<AssignedToMe />} />
        <Route path="/issues/:id" element={<IssuePage />} />
        <Route path="/pending-test-cases" element={<PendingTestCases />} />
        {/* Resolves the drilldown chain, then redirects — see TestCasePage. */}
        <Route path="/test-cases/:id" element={<TestCasePage />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/help" element={<Help />} />
        {/* Inside the layout: a signed-in user who mistypes a URL keeps the shell. */}
        <Route path="*" element={<NotFound />} />
      </Route>
      </Routes>
      </Suspense>
    </>
  );
}
