import crypto from "crypto";
import jwt from "jsonwebtoken";
import { describe, it, expect, beforeAll, vi } from "vitest";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CLIENT = "22222222-2222-2222-2222-222222222222";
const ISS = `https://login.microsoftonline.com/${TENANT}/v2.0`;

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-kid", alg: "RS256", use: "sig" };

const sign = (payload: object, header: object = {}) =>
  jwt.sign(payload, privateKey, { algorithm: "RS256", keyid: "test-kid", ...header });

let verifyMicrosoftToken: typeof import("./sso.js").verifyMicrosoftToken;

beforeAll(async () => {
  process.env.MS_SSO_ENABLED = "true";
  process.env.MS_TENANT_ID = TENANT;
  process.env.MS_CLIENT_ID = CLIENT;
  vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ keys: [jwk] }) }));
  ({ verifyMicrosoftToken } = await import("./sso.js"));
});

const base = { iss: ISS, aud: CLIENT, preferred_username: "qa@hpam.co.id", name: "QA One" };

describe("verifyMicrosoftToken", () => {
  it("accepts a well-formed token and returns the email", async () => {
    await expect(verifyMicrosoftToken(sign(base))).resolves.toEqual({
      email: "qa@hpam.co.id",
      name: "QA One",
    });
  });

  it("falls back to the email claim", async () => {
    const { preferred_username: _, ...rest } = base;
    const id = await verifyMicrosoftToken(sign({ ...rest, email: "lead@hpam.co.id" }));
    expect(id.email).toBe("lead@hpam.co.id");
  });

  it("rejects a token for another audience", async () => {
    await expect(verifyMicrosoftToken(sign({ ...base, aud: "other-app" }))).rejects.toThrow();
  });

  it("rejects a token from another tenant", async () => {
    const other = "https://login.microsoftonline.com/99999999-9999-9999-9999-999999999999/v2.0";
    await expect(verifyMicrosoftToken(sign({ ...base, iss: other }))).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    await expect(verifyMicrosoftToken(sign({ ...base, iat: past, exp: past + 60 }))).rejects.toThrow();
  });

  it("rejects a token signed by a key we don't know", async () => {
    const rogue = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    const token = jwt.sign(base, rogue, { algorithm: "RS256", keyid: "test-kid" });
    await expect(verifyMicrosoftToken(token)).rejects.toThrow();
  });

  it("rejects an unsigned (alg=none) token", async () => {
    const none = jwt.sign(base, "", { algorithm: "none", keyid: "test-kid" });
    await expect(verifyMicrosoftToken(none)).rejects.toThrow();
  });

  it("rejects a token with no email claim", async () => {
    await expect(verifyMicrosoftToken(sign({ iss: ISS, aud: CLIENT, name: "No Mail" }))).rejects.toThrow(
      /no email claim/,
    );
  });
});
