import { describe, expect, it } from "vitest";
import { safeName } from "./s3.js";

describe("safeName", () => {
  it("keeps a readable name and strips path + unsafe chars", () => {
    expect(safeName("Screen Shot 2026.png")).toBe("Screen_Shot_2026.png");
    expect(safeName("../../etc/passwd")).toBe("passwd");
    expect(safeName("C:\\x\\a b?.mp4")).toBe("a_b_.mp4");
    expect(safeName("...")).toBe("file");
  });
});
