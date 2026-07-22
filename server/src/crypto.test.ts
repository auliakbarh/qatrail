import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "./crypto.js";

describe("crypto", () => {
  it("round-trips a secret", () => {
    const enc = encryptSecret("s3cr3t-pass", "passphrase");
    expect(enc).not.toContain("s3cr3t-pass");
    expect(decryptSecret(enc, "passphrase")).toBe("s3cr3t-pass");
  });

  it("produces different ciphertext each time (random IV)", () => {
    expect(encryptSecret("x", "k")).not.toBe(encryptSecret("x", "k"));
  });

  it("fails to decrypt with the wrong passphrase", () => {
    const enc = encryptSecret("hello", "right");
    expect(() => decryptSecret(enc, "wrong")).toThrow();
  });
});
