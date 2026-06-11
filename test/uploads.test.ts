import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createClient, KitNetworkError } from "../src/index";
import { jsonResponse, stubFetch } from "./helpers";

const client = () => createClient({ publishableKey: "pk_test" });

const ticket = {
  signed_id: "signed-abc",
  filename: "resume.pdf",
  content_type: "application/pdf",
  byte_size: 11,
  direct_upload: {
    url: "https://storage.example.com/bucket/key?signature=xyz",
    headers: {
      "Content-Type": "application/pdf",
      "Content-MD5": "ignored-by-test",
    },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createUpload", () => {
  it("POSTs blob metadata wrapped in { blob } and returns the ticket", async () => {
    const { calls } = stubFetch(() => jsonResponse(ticket, 201));

    const meta = {
      filename: "resume.pdf",
      byte_size: 11,
      checksum: "abc==",
      content_type: "application/pdf",
    };
    const result = await client().createUpload(meta);

    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url.pathname).toBe("/api/public/v1/direct_uploads");
    expect(calls[0]!.headers["Content-Type"]).toBe("application/json");
    expect(calls[0]!.body).toEqual({ blob: meta });
    expect(result.signed_id).toBe("signed-abc");
    expect(result.direct_upload.url).toContain("storage.example.com");
  });
});

describe("uploadFile", () => {
  const fileBytes = new TextEncoder().encode("hello world");
  const expectedChecksum = createHash("md5").update(fileBytes).digest("base64");

  it("computes the base64 MD5 checksum, registers the blob, then PUTs the bytes", async () => {
    const { calls } = stubFetch((call) =>
      call.method === "POST"
        ? jsonResponse(ticket, 201)
        : new Response(null, { status: 200 })
    );

    const blob = new Blob([fileBytes], { type: "application/pdf" });
    const result = await client().uploadFile(blob, { filename: "resume.pdf" });

    expect(result).toEqual({ signed_id: "signed-abc" });
    expect(calls).toHaveLength(2);

    const register = calls[0]!;
    expect(register.body).toEqual({
      blob: {
        filename: "resume.pdf",
        byte_size: 11,
        checksum: expectedChecksum,
        content_type: "application/pdf",
      },
    });

    const put = calls[1]!;
    expect(put.method).toBe("PUT");
    expect(put.url.toString()).toBe(ticket.direct_upload.url);
    expect(put.headers).toEqual(ticket.direct_upload.headers);
    expect(put.rawBody).toBe(blob);
  });

  // `File` is only a global on Node 20+. On Node 18 it's absent and the SDK
  // intentionally degrades (no filename inference), so this capability test
  // only runs where `File` exists.
  it.skipIf(typeof File === "undefined")("infers filename and content type from a File", async () => {
    const { calls } = stubFetch((call) =>
      call.method === "POST"
        ? jsonResponse(ticket, 201)
        : new Response(null, { status: 200 })
    );

    const file = new File([fileBytes], "cv.pdf", { type: "application/pdf" });
    await client().uploadFile(file);

    expect(calls[0]!.body).toEqual({
      blob: {
        filename: "cv.pdf",
        byte_size: 11,
        checksum: expectedChecksum,
        content_type: "application/pdf",
      },
    });
  });

  it("falls back to application/octet-stream for typeless blobs", async () => {
    const { calls } = stubFetch((call) =>
      call.method === "POST"
        ? jsonResponse(ticket, 201)
        : new Response(null, { status: 200 })
    );

    await client().uploadFile(new Blob([fileBytes]));

    const blobMeta = (calls[0]!.body as { blob: { filename: string; content_type: string } }).blob;
    expect(blobMeta.filename).toBe("upload");
    expect(blobMeta.content_type).toBe("application/octet-stream");
  });

  it("throws KitNetworkError when the storage PUT fails", async () => {
    stubFetch((call) =>
      call.method === "POST"
        ? jsonResponse(ticket, 201)
        : new Response("denied", { status: 403 })
    );

    const error = await client()
      .uploadFile(new Blob([fileBytes], { type: "application/pdf" }))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KitNetworkError);
    expect((error as Error).message).toMatch(/403/);
  });
});
