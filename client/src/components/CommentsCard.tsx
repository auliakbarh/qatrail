import { useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { COMMENTS, ADD_COMMENT, UPDATE_COMMENT, DELETE_COMMENT } from "../graphql/comment";
import { useAuth } from "../store/auth";
import { fmtDateTime as fmt } from "../lib/utils";
import { withToast, denied } from "../store/toast";
import { canAct } from "../lib/perm";
import { Modal } from "./Modal";

type Target = "ISSUE" | "APP_TEST" | "USER_TEST" | "SESSION_TEST";

// Comments for any target. Author may edit/delete their own; admins may delete any.
export function CommentsCard({ target, targetId }: { target: Target; targetId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const vars = { target, targetId };
  const { data } = useQuery(COMMENTS, { variables: vars, fetchPolicy: "cache-and-network" });
  const [add, { loading }] = useMutation(ADD_COMMENT);
  const [update] = useMutation(UPDATE_COMMENT, { refetchQueries: [{ query: COMMENTS, variables: vars }] });
  const [del] = useMutation(DELETE_COMMENT, { refetchQueries: [{ query: COMMENTS, variables: vars }] });
  const [body, setBody] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [delId, setDelId] = useState<string | null>(null);
  const comments = data?.comments ?? [];
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAct(user?.role)) return denied();
    const text = body.trim();
    if (!text) return;
    setBody("");
    await withToast(
      add({
        variables: { ...vars, body: text },
        optimisticResponse: {
          addComment: {
            __typename: "Comment",
            id: `temp-${Math.random()}`,
            body: text,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            by: { __typename: "User", id: user?.id ?? "me", name: user?.name ?? "…" },
          },
        },
        update: (cache, { data: res }) => {
          const created = res?.addComment;
          if (!created) return;
          const prev: any = cache.readQuery({ query: COMMENTS, variables: vars });
          cache.writeQuery({ query: COMMENTS, variables: vars, data: { comments: [...(prev?.comments ?? []), created] } });
        },
      }),
      t("cmt.send"),
      t("c.somethingWrong"),
    );
  };

  const saveEdit = async (id: string) => {
    const text = editBody.trim();
    if (!text) return;
    setEditId(null);
    await withToast(update({ variables: { id, body: text } }), t("cmt.edited"), t("c.somethingWrong"));
  };

  return (
    <div className="rounded border border-border">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-sm font-semibold">{t("cmt.title")} ({comments.length})</h3>
      </div>
      <div className="space-y-3 px-5 py-4">
        {comments.length === 0 && <p className="text-xs text-muted-foreground">{t("cmt.empty")}</p>}
        {comments.map((c: any) => {
          const mine = c.by.id === user?.id;
          const edited = c.updatedAt && c.updatedAt !== c.createdAt;
          return (
            <div key={c.id} className="text-sm">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  <span className="font-medium text-foreground">{c.by.name}</span> · {fmt(c.createdAt)}
                  {edited && <span className="italic"> · {t("cmt.editedTag")}</span>}
                </span>
                {(mine || isAdmin) && editId !== c.id && (
                  <span className="flex gap-2">
                    {mine && (
                      <button
                        onClick={() => { setEditId(c.id); setEditBody(c.body); }}
                        className="text-primary hover:underline"
                      >
                        {t("c.edit")}
                      </button>
                    )}
                    <button
                      onClick={() => setDelId(c.id)}
                      className="text-destructive hover:underline"
                    >
                      {t("c.delete")}
                    </button>
                  </span>
                )}
              </div>
              {editId === c.id ? (
                <div className="mt-1 space-y-2">
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={2}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(c.id)} disabled={!editBody.trim()} className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                      {t("c.save")}
                    </button>
                    <button onClick={() => setEditId(null)} className="rounded border border-border px-3 py-1 text-xs hover:bg-muted">
                      {t("c.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{c.body}</div>
              )}
            </div>
          );
        })}
        <form onSubmit={submit} className="space-y-2 pt-1">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder={t("cmt.placeholder")}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button type="submit" disabled={loading || !body.trim()} className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {loading ? t("c.saving") : t("cmt.send")}
          </button>
        </form>
      </div>

      <Modal
        open={!!delId}
        onClose={() => setDelId(null)}
        title={t("cmt.deleteTitle")}
        footer={
          <>
            <button onClick={() => setDelId(null)} className="h-7 rounded border border-border px-3 text-xs hover:bg-muted">{t("c.cancel")}</button>
            <button
              onClick={() => {
                const id = delId;
                setDelId(null);
                if (id) withToast(del({ variables: { id } }), t("cmt.deleted"), t("c.somethingWrong"));
              }}
              className="h-7 rounded bg-destructive px-3 text-xs font-medium text-white hover:bg-destructive/90"
            >
              {t("c.delete")}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">{t("cmt.deleteBody")}</p>
      </Modal>
    </div>
  );
}
