import crypto from "crypto";

// Character sets exclude ambiguous glyphs (0/O, 1/l/I) so a generated password
// shown to a human can be read and typed without confusion.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGIT = "23456789";
const SYMBOL = "!@#$%^&*";
const ALL = UPPER + LOWER + DIGIT + SYMBOL;

const pick = (set: string) => set[crypto.randomInt(set.length)];

// Generate a policy-compliant password: length 12, guaranteed one of each class,
// remaining from the unambiguous pool, then shuffled so classes aren't positional.
export function generatePassword(): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SYMBOL)];
  while (chars.length < 12) chars.push(pick(ALL));
  // Fisher–Yates shuffle with a CSPRNG.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
