import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import { IS_WATCHING, SET_WATCH } from "../graphql/watch";

type Target = "ISSUE" | "APP_TEST";

// Toggle watching an issue/app test to receive its activity notifications.
export function WatchButton({ target, targetId }: { target: Target; targetId: string }) {
  const { t } = useTranslation();
  const vars = { target, targetId };
  const { data } = useQuery(IS_WATCHING, { variables: vars, fetchPolicy: "cache-and-network" });
  const [setWatch, { loading }] = useMutation(SET_WATCH, {
    refetchQueries: [{ query: IS_WATCHING, variables: vars }],
  });
  const watching = !!data?.isWatching;

  return (
    <button
      onClick={() => setWatch({ variables: { ...vars, watching: !watching } })}
      disabled={loading}
      title={watching ? t("watch.stop") : t("watch.start")}
      className={`flex h-7 items-center gap-1.5 rounded border px-2 text-xs disabled:opacity-50 ${
        watching ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
      }`}
    >
      {watching ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      {watching ? t("watch.watching") : t("watch.watch")}
    </button>
  );
}
