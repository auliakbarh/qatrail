// API keys and human-key parsing for the read-only public API.
// Pure functions only — no DB, no Express. See docs/API_PUBLIC.md.
import { createHash, randomBytes, timingSafeEqual } from "crypto";

/** A fresh raw key. Shown to the admin once; only its hash is stored. */
export function generateKey(): string {
  return `qat_${randomBytes(32).toString("base64url")}`;
}

/** Storage form of a key. SHA-256 is right here: the input is already high-entropy. */
export function hashKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/**
 * Constant-time compare of two hex digests. Length is compared first — both
 * sides are fixed-length SHA-256 hex, so an unequal length means malformed
 * input, not a secret worth protecting.
 */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export type EntityKind = "APP" | "ST" | "ISSUE";

export interface ParsedKey {
  kind: EntityKind;
  /** Set for a human key (`APP-12` → 12). */
  number?: number;
  /** Set when the caller passed the internal cuid instead. */
  id?: string;
}

const PREFIX: Record<EntityKind, string> = { APP: "APP", ST: "ST", ISSUE: "ISSUE" };

/**
 * Accept either the human key users type (`APP-12`, `ST-4`, `ISSUE-88`,
 * case-insensitive) or the internal cuid. Returns null when neither shape fits,
 * which the router turns into 400 BAD_KEY rather than a 404 — a malformed key
 * is a caller bug, a missing row is not.
 */
export function parseKey(kind: EntityKind, raw: string): ParsedKey | null {
  const value = raw.trim();
  if (!value) return null;

  const prefix = PREFIX[kind];
  const m = new RegExp(`^${prefix}-(\\d+)$`, "i").exec(value);
  if (m) {
    const number = Number(m[1]);
    return Number.isSafeInteger(number) && number > 0 ? { kind, number } : null;
  }

  // cuid: lowercase alphanumeric, starts with c, no separators.
  if (/^c[a-z0-9]{20,}$/.test(value)) return { kind, id: value };

  return null;
}

/** Human key for a row number, e.g. formatKey("APP", 12) → "APP-12". */
export function formatKey(kind: EntityKind, number: number): string {
  return `${PREFIX[kind]}-${number}`;
}
