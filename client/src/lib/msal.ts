import { PublicClientApplication } from "@azure/msal-browser";
import { MS_CLIENT_ID, MS_TENANT_ID } from "../config";

// Microsoft Entra sign-in (Authorization Code + PKCE, redirect flow).
//
// Import this module lazily — constructing PublicClientApplication throws when
// VITE_MS_CLIENT_ID is unset, and it must not take the login page down when SSO
// is off. Login.tsx only `import()`s it once `health.ssoEnabled` is true.
const msal = new PublicClientApplication({
  auth: {
    clientId: MS_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${MS_TENANT_ID}`,
    redirectUri: `${window.location.origin}/login`,
  },
  cache: { cacheLocation: "sessionStorage" },
});

let pending: Promise<string | null> = msal
  .initialize()
  .then(() => msal.handleRedirectPromise())
  .then((r) => r?.idToken ?? null)
  .catch(() => null);

/**
 * The id token when this page load is the Entra redirect callback, else null.
 * Consumed once: logging out is a client-side navigate, not a reload, so a
 * token left resolved here would sign the user straight back in.
 */
export async function takeRedirectIdToken(): Promise<string | null> {
  const token = await pending;
  pending = Promise.resolve(null);
  return token;
}

export async function loginWithMicrosoft(): Promise<void> {
  await pending; // ensure initialize() + any pending redirect settled
  // The server verifies the id token, not a Graph access token — these scopes are
  // only what makes Entra mint an id token with an email claim.
  await msal.loginRedirect({ scopes: ["openid", "profile", "email"] });
}
