import crypto from "crypto";

// Generate a policy-compliant password (upper+lower+digit+symbol, length ≥ 9).
// Used for the seeded super admin and admin-created users' default password.
export function generatePassword(): string {
  const pick = (set: string) => set[crypto.randomInt(set.length)];
  return (
    pick("ABCDEFGHJKLMNPQRSTUVWXYZ") +
    pick("abcdefghijkmnpqrstuvwxyz") +
    pick("23456789") +
    pick("!@#$%^&*") +
    crypto.randomBytes(8).toString("base64url").slice(0, 8)
  );
}
