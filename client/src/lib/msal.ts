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

/** The id token when this page load is the Entra redirect callback, else null. */
export const msalRedirectIdToken = msal
  .initialize()
  .then(() => msal.handleRedirectPromise())
  .then((r) => r?.idToken ?? null)
  .catch(() => null);

export async function loginWithMicrosoft(): Promise<void> {
  await msalRedirectIdToken; // ensure initialize() + any pending redirect settled
  // The server verifies the id token, not a Graph access token — these scopes are
  // only what makes Entra mint an id token with an email claim.
  await msal.loginRedirect({ scopes: ["openid", "profile", "email"] });
}
