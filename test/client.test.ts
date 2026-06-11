import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, DEFAULT_BASE_URL, KitApiError, KitNetworkError } from "../src/index";
import { jsonResponse, stubFetch } from "./helpers";

const emptyPage = {
  data: [],
  pagination: { current_page: 1, total_pages: 1, total_count: 0, per_page: 25 },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createClient", () => {
  it("throws when both keys are passed", () => {
    expect(() =>
      createClient({ publishableKey: "pk_test", secretKey: "sk_test" })
    ).toThrow(/not both/);
  });

  it("throws when no key is passed", () => {
    expect(() => createClient({})).toThrow(/required/);
  });

  it("throws when a secret key is used in a browser", () => {
    vi.stubGlobal("window", { document: {} });
    expect(() => createClient({ secretKey: "sk_test" })).toThrow(
      /never be used in a browser/
    );
  });

  it("allows a publishable key in a browser", () => {
    vi.stubGlobal("window", { document: {} });
    expect(() => createClient({ publishableKey: "pk_test" })).not.toThrow();
  });

  it("allows a secret key outside the browser", () => {
    expect(() => createClient({ secretKey: "sk_test" })).not.toThrow();
  });

  it("sends the key as a Bearer token against the default base URL", async () => {
    const { calls } = stubFetch(() => jsonResponse(emptyPage));
    const client = createClient({ secretKey: "sk_live_123" });

    await client.listJobs();

    expect(calls[0]!.url.origin).toBe(DEFAULT_BASE_URL);
    expect(calls[0]!.url.pathname).toBe("/api/public/v1/jobs");
    expect(calls[0]!.headers["Authorization"]).toBe("Bearer sk_live_123");
    expect(calls[0]!.headers["Accept"]).toBe("application/json");
  });

  it("respects a custom baseUrl", async () => {
    const { calls } = stubFetch(() => jsonResponse(emptyPage));
    const client = createClient({
      publishableKey: "pk_test",
      baseUrl: "http://localhost:3000",
    });

    await client.listJobs();

    expect(calls[0]!.url.toString()).toBe(
      "http://localhost:3000/api/public/v1/jobs"
    );
  });

  it("wraps fetch failures in KitNetworkError with the cause attached", async () => {
    const boom = new TypeError("fetch failed");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(boom)));
    const client = createClient({ secretKey: "sk_test" });

    const error = await client.listJobs().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KitNetworkError);
    expect((error as KitNetworkError).cause).toBe(boom);
  });

  it("parses the error envelope into KitApiError", async () => {
    stubFetch(() =>
      jsonResponse(
        { error: { code: "invalid_key", message: "Invalid API key" } },
        401
      )
    );
    const client = createClient({ secretKey: "sk_test" });

    const error = await client.listJobs().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KitApiError);
    const apiError = error as KitApiError;
    expect(apiError.status).toBe(401);
    expect(apiError.code).toBe("invalid_key");
    expect(apiError.message).toBe("Invalid API key");
    expect(apiError.fields).toBeUndefined();
  });

  it("falls back to a generic KitApiError when the error body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>Bad gateway</html>", { status: 502 }))
    );
    const client = createClient({ secretKey: "sk_test" });

    const error = await client.listJobs().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KitApiError);
    const apiError = error as KitApiError;
    expect(apiError.status).toBe(502);
    expect(apiError.code).toBe("unknown_error");
    expect(apiError.message).toMatch(/502/);
  });
});
