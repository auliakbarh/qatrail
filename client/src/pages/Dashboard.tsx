import { useAuth } from "../store/auth";

// M0 placeholder. M1 replaces this with the Project → Feature → TestCase tree.
export default function Dashboard() {
  const { user } = useAuth();
  return (
    <div className="space-y-4 p-6">
      <div className="rounded border border-border">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Dashboard</h2>
        </div>
        <div className="px-5 py-4 text-sm text-muted-foreground">
          Welcome, {user?.name}. Project hierarchy lands in M1.
        </div>
      </div>
    </div>
  );
}
