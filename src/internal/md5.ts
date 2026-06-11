/**
 * Minimal MD5 (RFC 1321) over a byte array, returned as base64.
 *
 * Vendored because WebCrypto deliberately omits MD5, but Active Storage
 * direct uploads require a base64 MD5 `checksum` (it becomes the S3
 * `Content-MD5` header). This is a clean-room implementation of the
 * public-domain reference algorithm — no runtime dependencies.
 *
 * MD5 is used here strictly as a transfer integrity check, not for
 * anything security-sensitive.
 */

// Per-round left-rotate amounts.
const SHIFTS = [
  7, 12, 17, 22, // round 1
  5, 9, 14, 20, // round 2
  4, 11, 16, 23, // round 3
  6, 10, 15, 21, // round 4
];

// K[i] = floor(abs(sin(i + 1)) * 2^32) — the RFC 1321 constant table.
const K = /* @__PURE__ */ (() => {
  const table = new Uint32Array(64);
  for (let i = 0; i < 64; i++) {
    table[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
  }
  return table;
})();

function rotl(x: number, n: number): number {
  return (x << n) | (x >>> (32 - n));
}

/** Computes the 16-byte MD5 digest of `input`. */
export function md5(input: Uint8Array): Uint8Array {
  // Pad: 0x80, zeros, then the original bit length as a 64-bit LE integer,
  // so the total length is a multiple of 64 bytes.
  const bitLength = input.length * 8;
  const paddedLength = (((input.length + 8) >> 6) + 1) << 6;
  const data = new Uint8Array(paddedLength);
  data.set(input);
  data[input.length] = 0x80;

  const view = new DataView(data.buffer);
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 4294967296), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const m = new Uint32Array(16);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let j = 0; j < 16; j++) {
      m[j] = view.getUint32(offset + j * 4, true);
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) & 15;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) & 15;
      }

      const rotated = rotl((a + f + K[i]! + m[g]!) | 0, SHIFTS[((i >> 4) << 2) | (i & 3)]!);
      a = d;
      d = c;
      c = b;
      b = (b + rotated) | 0;
    }

    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  const digest = new Uint8Array(16);
  const out = new DataView(digest.buffer);
  out.setUint32(0, a0 >>> 0, true);
  out.setUint32(4, b0 >>> 0, true);
  out.setUint32(8, c0 >>> 0, true);
  out.setUint32(12, d0 >>> 0, true);
  return digest;
}

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Environment-agnostic base64 encoding (no Buffer, no btoa). */
function toBase64(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const byte0 = bytes[i]!;
    const byte1 = bytes[i + 1];
    const byte2 = bytes[i + 2];

    result += BASE64_ALPHABET[byte0 >> 2]!;
    result += BASE64_ALPHABET[((byte0 & 0x03) << 4) | ((byte1 ?? 0) >> 4)]!;
    result += byte1 === undefined ? "=" : BASE64_ALPHABET[((byte1 & 0x0f) << 2) | ((byte2 ?? 0) >> 6)]!;
    result += byte2 === undefined ? "=" : BASE64_ALPHABET[byte2 & 0x3f]!;
  }
  return result;
}

/** Base64-encoded MD5 digest, as required by Active Storage / S3 Content-MD5. */
export function md5Base64(input: Uint8Array): string {
  return toBase64(md5(input));
}
