import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { USER_TEST, DELETE_USER_TEST } from "../graphql/usertest";
import { useNav } from "../store/nav";
import { IconBtn } from "../components/IconBtn";
import { DeleteConfirm } from "../components/DeleteConfirm";
import { CommentsCard } from "../components/CommentsCard";
import { WatchButton } from "../components/WatchButton";
import { RefreshBtn } from "../components/RefreshBtn";
import { withToast } from "../store/toast";
import { fmtDateTime as fmt } from "../lib/utils";
import { UserTestForm } from "./forms/UserTestForm";
import { useAuth } from "../store/auth";
import { canAct } from "../lib/perm";
import { DetailSkeleton } from "../components/Skeleton";

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}

export default function UserTestDetail() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { panel, openPanel } = useNav();
  const { user } = useAuth();
  const act = canAct(user?.role);

  const { data, loading, refetch } = useQuery(USER_TEST, { variables: { id }, fetchPolicy: "cache-and-network" });
  const [deleteUserTest] = useMutation(DELETE_USER_TEST);
  const [del, setDel] = useState(false);

  if (loading && !data) return <div className="p-6"><DetailSkeleton /></div>;
  const u = data?.userTest;
  // User test was deleted (or never existed): show a deleted state, not a blank page.
  if (!u) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/30 px-4 text-center">
        <h1 className="text-lg font-semibold">{t("ut.deletedTitle")}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t("ut.deletedText")}</p>
        <button onClick={() => navigate("/user-tests")} className="text-xs text-primary underline underline-offset-2 hover:text-primary/80">
          {t("ut.backToList")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {/* Header */}
        <div className="rounded border border-border">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <button onClick={() => navigate("/user-tests")} className="flex h-7 w-7 items-center justify-center rounded border border-border hover:bg-muted">
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <span className="font-mono text-xs text-muted-foreground">{u.key}</span>
              <span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{u.environment}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <RefreshBtn onClick={() => void refetch()} loading={loading} />
              <WatchButton target="USER_TEST" targetId={id} />
              <IconBtn allowed={act} title={t("c.edit")} onClick={() => openPanel({ kind: "usertest", mode: "edit", id: u.id })}><Pencil className="h-3.5 w-3.5" /></IconBtn>
              <IconBtn allowed={act} title={t("c.delete")} onClick={() => setDel(true)}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 px-5 py-4 text-sm md:grid-cols-3">
            <Info label={t("ut.account")} value={u.account} />
            <Info label={t("ut.password")} value={<span className="font-mono">{u.password || "—"}</span>} />
            <Info label={t("ut.project")} value={u.projectName} />
            <Info label={t("iss.environment")} value={u.environment} />
            <Info label={t("at.creator")} value={u.createdBy?.name ?? "—"} />
            <Info label={t("at.dateCreated")} value={fmt(u.createdAt)} />
            {u.note && <Info label={t("c.note")} value={<span className="whitespace-pre-wrap">{u.note}</span>} />}
          </div>
        </div>

        <CommentsCard target="USER_TEST" targetId={id} />

        <DeleteConfirm
          open={del}
          onClose={() => setDel(false)}
          onConfirm={async () => {
            const ok = await withToast(deleteUserTest({ variables: { id: u.id } }), t("t.userTestDeleted"), t("t.userTestDeleteFail"));
            if (ok) navigate("/user-tests");
          }}
          label={u.key}
        />
      </div>

      {panel?.kind === "usertest" && <UserTestForm panel={panel} />}
    </div>
  );
}
