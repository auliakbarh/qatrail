import { describe, it, expect, vi, beforeEach } from "vitest";

// JIRA creds must exist before env.js is evaluated (it snapshots process.env at
// import time), so every module here is imported dynamically, after stubEnv.
// Discord is stubbed so the test asserts the call, not a real webhook.
vi.stubEnv("JIRA_BASE_URL", "https://jira.test");
vi.stubEnv("JIRA_EMAIL", "qa@test");
vi.stubEnv("JIRA_API_TOKEN", "t");
const notifyDiscord = vi.fn();
vi.mock("./discord.js", async (orig) => ({
  ...(await orig<typeof import("./discord.js")>()),
  notifyDiscord: (...a: unknown[]) => notifyDiscord(...a),
}));
const { addComment } = await import("./jira.js");
const { NOTIFIABLE } = await import("./discord.js");

describe("jira comment failure -> discord", () => {
  beforeEach(() => notifyDiscord.mockClear());

  it("reports the status and body when JIRA rejects the comment", async () => {
    vi.stubGlobal("fetch", async () => new Response("no permission", { status: 403 }));
    expect(await addComment("ATH-901", { type: "doc" })).toBeNull();
    expect(notifyDiscord).toHaveBeenCalledTimes(1);
    const [field, actor, detail] = notifyDiscord.mock.calls[0];
    expect(field).toBe("jiraCommentFailed");
    expect(actor).toBe("system");
    expect(detail.name).toBe("ATH-901");
    expect(detail.note).toContain("403");
    expect(detail.note).toContain("no permission");
  });

  it("reports a thrown network error too", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("ECONNREFUSED"); });
    expect(await addComment("ATH-901", { type: "doc" })).toBeNull();
    expect(notifyDiscord.mock.calls[0][2].note).toContain("ECONNREFUSED");
  });

  it("stays silent on success", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ id: "10001" }));
    expect(await addComment("ATH-901", { type: "doc" })).toBe("10001");
    expect(notifyDiscord).not.toHaveBeenCalled();
  });

  it("keeps the event out of NOTIFIABLE — it is not a mutation", () => {
    expect(NOTIFIABLE.has("jiraCommentFailed")).toBe(false);
  });
});
