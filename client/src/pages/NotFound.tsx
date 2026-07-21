import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted/30 px-4">
      <h1 className="text-2xl font-semibold">404</h1>
      <p className="text-sm text-muted-foreground">Page not found.</p>
      <Link to="/" className="text-xs text-primary underline underline-offset-2 hover:text-primary/80">
        Back to dashboard
      </Link>
    </div>
  );
}
