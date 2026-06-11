import { describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { md5Base64 } from "../src/internal/md5";

function reference(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).digest("base64");
}

describe("md5Base64", () => {
  it("matches the RFC 1321 empty-string vector", () => {
    // hex d41d8cd98f00b204e9800998ecf8427e
    expect(md5Base64(new Uint8Array(0))).toBe("1B2M2Y8AsgTpgAmY7PhCfg==");
  });

  it("matches the RFC 1321 'abc' vector", () => {
    // hex 900150983cd24fb0d6963f7d28e17f72
    expect(md5Base64(new TextEncoder().encode("abc"))).toBe(
      "kAFQmDzST7DWlj99KOF/cg=="
    );
  });

  it("matches the RFC 1321 alphanumeric vector", () => {
    const input = new TextEncoder().encode(
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    );
    expect(md5Base64(input)).toBe(reference(input));
  });

  it("matches node:crypto for every length around block boundaries (0..130)", () => {
    for (let length = 0; length <= 130; length++) {
      const bytes = randomBytes(length);
      const input = new Uint8Array(bytes);
      expect(md5Base64(input), `length ${length}`).toBe(reference(input));
    }
  });

  it("matches node:crypto for a multi-block binary payload", () => {
    const input = new Uint8Array(randomBytes(100_000));
    expect(md5Base64(input)).toBe(reference(input));
  });
});
