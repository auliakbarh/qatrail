import { env } from "./env.js";

// Microsoft Entra SSO — PREPARED, NOT IMPLEMENTED.
//
// When Entra access is available, wire token verification here:
//   1. Fetch Entra JWKS: https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys
//   2. Verify the id token signature + `aud` (clientId) + `iss` + expiry.
//   3. Return the verified email (preferred_username / email claim).
// Until then this throws so microsoftLogin fails closed.

export interface SsoIdentity {
  email: string;
  name?: string;
}

export async function verifyMicrosoftToken(_idToken: string): Promise<SsoIdentity> {
  if (!env.msSso.enabled) {
    throw new Error("Microsoft SSO is not enabled.");
  }
  // TODO: verify against Entra JWKS (tenantId=env.msSso.tenantId, clientId=env.msSso.clientId).
  throw new Error("Microsoft SSO token verification is not yet implemented.");
}
