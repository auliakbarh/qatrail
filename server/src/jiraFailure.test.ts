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
const { addComment, testJira, postedFooter, issueMarkdown } = await import("./jira.js");
const { NOTIFIABLE } = await import("./discord.js");

// 07 Aug 2026 09:12 UTC = 16:12 in Jakarta (UTC+7), so the footer must not print 09:12.
const BY = { name: "Aulia", email: "it@hpam.co.id", at: new Date("2026-08-07T09:12:00Z") };

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

describe("comment footer", () => {
  it("stamps Jakarta time regardless of the server timezone", () => {
    const f = postedFooter(BY, "https://qa.test/issues/1");
    expect(f).toContain("Aulia");
    expect(f).toContain("it@hpam.co.id");
    expect(f).toContain("7 Aug 2026");
    expect(f).toContain("16:12 WIB");
    expect(f).toContain("(https://qa.test/issues/1)");
  });

  it("rides on the issue comment too, not only the app test one", () => {
    const md = issueMarkdown({
      url: "https://qa.test/issues/1",
      type: "BUG", environment: "STAGING", platform: "ANDROID", priority: "HIGH",
      testedAt: BY.at, testAccount: "qa@test", reporterName: "R", assigneeName: "A",
      title: "T", steps: "s", actualResult: "a", expectedResult: "e",
      postedBy: BY,
    });
    expect(md).toContain("16:12 WIB");
    expect(md).toContain("Open issue in QA Reporting");
  });
});

describe("admin JIRA connectivity test", () => {
  beforeEach(() => notifyDiscord.mockClear());

  it("without a ticket key it only identifies the account", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      seen.push(u);
      return Response.json({ displayName: "QA Bot", emailAddress: "qa@test" });
    });
    const r = await testJira(null, BY);
    expect(r.ok).toBe(true);
    expect(r.message).toContain("QA Bot");
    expect(seen).toEqual(["https://jira.test/rest/api/3/myself"]);
  });

  it("with a ticket key it posts and reports the comment id", async () => {
    vi.stubGlobal("fetch", async (u: string) =>
      u.endsWith("/myself")
        ? Response.json({ displayName: "QA Bot", emailAddress: "qa@test" })
        : Response.json({ id: "34088" }),
    );
    const r = await testJira("cai-652", BY);
    expect(r.ok).toBe(true);
    expect(r.message).toContain("34088");
    expect(r.message).toContain("CAI-652"); // upper-cased before use
  });

  it("reports bad credentials without attempting a comment", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 401 }));
    const r = await testJira("CAI-652", BY);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("401");
    expect(notifyDiscord).not.toHaveBeenCalled();
  });

  it("signs the test comment with the admin who pressed the button", async () => {
    let body = "";
    vi.stubGlobal("fetch", async (u: string, init: RequestInit) => {
      if (u.endsWith("/myself")) return Response.json({ displayName: "QA Bot", emailAddress: "qa@test" });
      body = String(init.body);
      return Response.json({ id: "1" });
    });
    await testJira("CAI-652", BY);
    expect(body).toContain("Aulia");
    expect(body).toContain("it@hpam.co.id");
    expect(body).toContain("16:12"); // Jakarta, not the 09:12 UTC instant
  });

  it("asks JIRA for English error bodies", async () => {
    let lang: string | undefined;
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      lang = (init.headers as Record<string, string>)["Accept-Language"];
      return Response.json({ displayName: "QA Bot", emailAddress: "qa@test" });
    });
    await testJira(null, BY);
    expect(lang).toMatch(/^en/);
  });
});
