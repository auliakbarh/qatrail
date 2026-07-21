// Mirror of server/src/passwordPolicy.ts — keep in sync.
export type PasswordRule = "length" | "upper" | "lower" | "number" | "symbol";

export const MIN_PASSWORD_LENGTH = 9;

export function unmetPasswordRules(pw: string): PasswordRule[] {
  const unmet: PasswordRule[] = [];
  if (pw.length < MIN_PASSWORD_LENGTH) unmet.push("length");
  if (!/[A-Z]/.test(pw)) unmet.push("upper");
  if (!/[a-z]/.test(pw)) unmet.push("lower");
  if (!/[0-9]/.test(pw)) unmet.push("number");
  if (!/[^A-Za-z0-9]/.test(pw)) unmet.push("symbol");
  return unmet;
}

export function isStrongPassword(pw: string): boolean {
  return unmetPasswordRules(pw).length === 0;
}
