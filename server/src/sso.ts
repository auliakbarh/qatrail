import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "./env.js";

// Microsoft Entra SSO — verifies the id token the SPA gets from msal-browser.
//
// Deliberately NOT the Graph access token: its `aud` is Microsoft Graph and its
// signature is nonce-encrypted, so a third party cannot verify it. The id token
// is issued *for this app* (`aud` = clientId) and is the only one we can trust.

export interface SsoIdentity {
  email: string;
  name?: string;
}

// Entra signing keys, cached in memory. Rotated rarely, so we only refetch when
// a token arrives with a kid we don't know.
// ponytail: no TTL — an unknown kid is the only refresh trigger we need.
let jwks: Map<string, crypto.KeyObject> | null = null;

async function loadJwks(): Promise<Map<string, crypto.KeyObject>> {
  const url = `https://login.microsoftonline.com/${env.msSso.tenantId}/discovery/v2.0/keys`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch Entra signing keys (${res.status}).`);
  const body = (await res.json()) as { keys?: Array<crypto.JsonWebKey & { kid?: string }> };
  const entries: Array<[string, crypto.KeyObject]> = [];
  for (const key of body.keys ?? []) {
    if (!key.kid) continue;
    entries.push([key.kid, crypto.createPublicKey({ key, format: "jwk" })]);
  }
  jwks = new Map(entries);
  return jwks;
}

async function keyFor(kid: string): Promise<crypto.KeyObject> {
  const key = jwks?.get(kid) ?? (await loadJwks()).get(kid);
  if (!key) throw new Error("Microsoft token was signed by an unknown key.");
  return key;
}

/**
 * Whether an email may sign in with SSO. An empty list allows every domain —
 * the Entra tenant is already the outer fence; this narrows it when the tenant
 * holds guests or several domains.
 *
 * Exact domain match, case-insensitive. Subdomains do NOT inherit: "hpam.co.id"
 * does not admit "x.hpam.co.id", because a suffix match would also admit
 * "evilhpam.co.id" to anyone who writes the check the obvious way.
 */
export function domainAllowed(email: string, allowed: string[]): boolean {
  if (!allowed.length) return true;
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  return allowed.some((d) => d.trim().toLowerCase().replace(/^@/, "") === domain);
}

export async function verifyMicrosoftToken(idToken: string): Promise<SsoIdentity> {
  const { enabled, tenantId, clientId } = env.msSso;
  if (!enabled) throw new Error("Microsoft SSO is not enabled.");
  if (!tenantId || !clientId) throw new Error("Microsoft SSO is misconfigured (MS_TENANT_ID / MS_CLIENT_ID missing).");

  const kid = jwt.decode(idToken, { complete: true })?.header?.kid;
  if (!kid) throw new Error("Invalid Microsoft token.");

  const claims = jwt.verify(idToken, await keyFor(kid), {
    algorithms: ["RS256"],
    audience: clientId,
    // ponytail: single-tenant issuer, pinned to the configured tenant. For a
    // multi-tenant registration, drop this and allow-list the `tid` claim instead.
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  }) as jwt.JwtPayload;

  const email = claims.preferred_username ?? claims.email;
  if (typeof email !== "string" || !email.includes("@")) {
    throw new Error("Microsoft token carries no email claim.");
  }
  return { email, name: typeof claims.name === "string" ? claims.name : undefined };
}
