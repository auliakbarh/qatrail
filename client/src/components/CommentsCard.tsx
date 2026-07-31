import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { useTranslation } from "react-i18next";
import { COMMENTS, ADD_COMMENT, UPDATE_COMMENT, DELETE_COMMENT, MENTIONABLE_USERS } from "../graphql/comment";
import { useAuth } from "../store/auth";
import { fmtDateTime as fmt } from "../lib/utils";
import { withToast, denied } from "../store/toast";
import { canAct } from "../lib/perm";
import { Modal } from "./Modal";

type Target = "ISSUE" | "APP_TEST" | "USER_TEST" | "SESSION_TEST" | "TEST_CASE";
type MUser = { id: string; name: string };

const inputCls = "w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

// Textarea with an "@" name picker. Picking inserts the plain text "@Name" — the
// server matches mentions by name, so there is no id to carry around.
function MentionTextarea({ value, onChange, users, rows, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  users: MUser[];
  rows: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const matches =
    query === null ? [] : users.filter((u) => u.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  // Open the picker while the caret sits inside an unfinished "@…" token.
  const sync = (el: HTMLTextAreaElement) => {
    const m = /@([^@\n]{0,30})$/.exec(el.value.slice(0, el.selectionStart));
    setQuery(m ? m[1] : null);
  };

  const pick = (name: string) => {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart;
    const head = el.value.slice(0, caret).replace(/@[^@\n]{0,30}$/, `@${name} `);
    onChange(head + el.value.slice(caret));
    setQuery(null);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(head.length, head.length); });
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); sync(e.target); }}
        onKeyUp={(e) => sync(e.currentTarget)}
        onBlur={() => setQuery(null)}
        onKeyDown={(e) => {
          if (!matches.length) return;
          if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[0].name); }
          else if (e.key === "Escape") setQuery(null);
        }}
        className={inputCls}
      />
      {matches.length > 0 && (
        <ul className="absolute left-0 top-full z-10 mt-1 w-56 overflow-hidden rounded border border-border bg-background shadow">
          {matches.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(u.name)}
                className="block w-full px-3 py-1.5 text-left text-xs hover:bg-muted"
              >
                {u.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
  const users: MUser[] = useQuery(MENTIONABLE_USERS).data?.mentionableUsers ?? [];

  // Longest name first so "@Ana Lee" wins over "@Ana"; capture group => odd split parts are mentions.
  const mentionRe = useMemo(() => {
    const names = users
      .map((u) => u.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .sort((a, b) => b.length - a.length);
    return names.length ? new RegExp(`(@(?:${names.join("|")}))`, "gi") : null;
  }, [users]);

  const renderBody = (text: string) =>
    !mentionRe
      ? text
      : text.split(mentionRe).map((part, i) =>
          i % 2 ? (
            <span key={i} className="rounded bg-primary/10 px-0.5 font-medium text-primary">{part}</span>
          ) : (
            part
          ),
        );

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
                  <MentionTextarea value={editBody} onChange={setEditBody} users={users} rows={2} />
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
                <div className="whitespace-pre-wrap">{renderBody(c.body)}</div>
              )}
            </div>
          );
        })}
        <form onSubmit={submit} className="space-y-2 pt-1">
          <MentionTextarea value={body} onChange={setBody} users={users} rows={2} placeholder={t("cmt.placeholder")} />
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
