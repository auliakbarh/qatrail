import { useState, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";

// Password field with a show/hide toggle. Forwards ref + spreads props so it
// works with react-hook-form's register() and plain controlled usage alike.
export const PasswordInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function PasswordInput({ className = "", ...props }, ref) {
    const { t } = useTranslation();
    const [show, setShow] = useState(false);
    return (
      <div className="relative">
        <input
          ref={ref}
          type={show ? "text" : "password"}
          className={`w-full rounded border border-border bg-background px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${className}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          tabIndex={-1}
          title={show ? t("pw.hide") : t("pw.show")}
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    );
  },
);
