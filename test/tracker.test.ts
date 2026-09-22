import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  createTracker,
  DEFAULT_BASE_URL,
  KitApiError,
  KitNetworkError,
} from "../src/index";
import { jsonResponse, stubFetch } from "./helpers";

type Listener = (event?: unknown) => void;

function stubBrowser(overrides: { referrer?: string; href?: string } = {}) {
  const listeners: Record<string, Listener[]> = {};
  const addEventListener = (type: string, listener: Listener) => {
    (listeners[type] ??= []).push(listener);
  };
  const document = {
    referrer: overrides.referrer ?? "",
    visibilityState: "visible",
    addEventListener,
  };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", { document, addEventListener });
  vi.stubGlobal("location", {
    href: overrides.href ?? "https://careers.acme.test/jobs/tok_1",
  });
  return {
    document,
    fire(type: string) {
      for (const listener of listeners[type] ?? []) listener();
    },
  };
}

const accepted = (count: number) => jsonResponse({ accepted: count, rejected: [] }, 202);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createTracker", () => {
  it("throws when a secret key is passed", () => {
    stubBrowser();
    expect(() => createTracker({ publishableKey: "sk_test" })).toThrow(
      /never be used in a browser/
    );
  });

  it("is a no-op that warns once when the key is missing in a browser", () => {
    stubBrowser();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { calls } = stubFetch(() => accepted(1));

    const tracker = createTracker({ publishableKey: undefined });
    tracker.jobBoardViewed();
    tracker.jobViewed("tok_1");
    vi.advanceTimersByTime(5000);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/without a publishableKey/);
    expect(calls).toHaveLength(0);
  });

  it("is a silent no-op outside a browser", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { calls } = stubFetch(() => accepted(1));

    const tracker = createTracker({ publishableKey: "pk_test" });
    tracker.jobViewed("tok_1");
    await tracker.flush();

    expect(warn).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("is a no-op when enabled is false", async () => {
    stubBrowser();
    const { calls } = stubFetch(() => accepted(1));

    const tracker = createTracker({ publishableKey: "pk_test", enabled: false });
    tracker.jobViewed("tok_1");
    vi.advanceTimersByTime(5000);
    await tracker.flush();

    expect(calls).toHaveLength(0);
  });
});

describe("tracking", () => {
  it("posts the contract payload with the key as a Bearer token and keepalive", async () => {
    stubBrowser({
      referrer: "https://www.linkedin.com/",
      href: "https://careers.acme.test/jobs/tok_1?utm_source=linkedin",
    });
    vi.setSystemTime(new Date("2026-09-22T10:00:00.000Z"));
    const { calls } = stubFetch(() => accepted(2));

    const tracker = createTracker({ publishableKey: "pk_live_123" });
    tracker.jobViewed("tok_1");
    tracker.jobBoardViewed();
    await tracker.flush();

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.method).toBe("POST");
    expect(call.url.toString()).toBe(`${DEFAULT_BASE_URL}/api/public/v1/events`);
    expect(call.headers["Authorization"]).toBe("Bearer pk_live_123");
    expect(call.headers["Content-Type"]).toBe("application/json");
    expect(call.headers["Accept"]).toBe("application/json");
    expect(call.body).toEqual({
      events: [
        {
          name: "job.viewed",
          job: "tok_1",
          url: "https://careers.acme.test/jobs/tok_1?utm_source=linkedin",
          referrer: "https://www.linkedin.com/",
          time: "2026-09-22T10:00:00.000Z",
        },
        {
          name: "job_board.viewed",
          url: "https://careers.acme.test/jobs/tok_1?utm_source=linkedin",
          referrer: "https://www.linkedin.com/",
          time: "2026-09-22T10:00:00.000Z",
        },
      ],
    });
    const init = (fetch as Mock).mock.calls[0]![1] as RequestInit;
    expect(init.keepalive).toBe(true);
  });

  it("omits referrer when the document has none", async () => {
    stubBrowser({ referrer: "" });
    const { calls } = stubFetch(() => accepted(1));

    const tracker = createTracker({ publishableKey: "pk_test" });
    tracker.talentPoolJoined();
    await tracker.flush();

    const event = (calls[0]!.body as { events: Record<string, unknown>[] }).events[0]!;
    expect(event).not.toHaveProperty("referrer");
    expect(event.name).toBe("talent_pool.joined");
  });

  it("respects a custom baseUrl", async () => {
    stubBrowser();
    const { calls } = stubFetch(() => accepted(1));

    const tracker = createTracker({
      publishableKey: "pk_test",
      baseUrl: "http://localhost:3000",
    });
    tracker.jobBoardViewed();
    await tracker.flush();

    expect(calls[0]!.url.toString()).toBe("http://localhost:3000/api/public/v1/events");
  });

  it.each(["", "   "])("falls back to the default base URL when baseUrl is %j", async (baseUrl) => {
    stubBrowser();
    const { calls } = stubFetch(() => accepted(1));

    const tracker = createTracker({ publishableKey: "pk_test", baseUrl });
    tracker.jobBoardViewed();
    await tracker.flush();

    expect(calls[0]!.url.toString()).toBe(`${DEFAULT_BASE_URL}/api/public/v1/events`);
  });

  it("batches events within the flush interval", async () => {
    stubBrowser();
    const { calls } = stubFetch(() => accepted(2));

    const tracker = createTracker({ publishableKey: "pk_test", flushInterval: 500 });
    tracker.jobBoardViewed();
    await vi.advanceTimersByTimeAsync(200);
    tracker.jobViewed("tok_1");
    expect(calls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(300);

    expect(calls).toHaveLength(1);
    expect((calls[0]!.body as { events: unknown[] }).events).toHaveLength(2);
  });

  it("uses a 1 second window by default", async () => {
    stubBrowser();
    const { calls } = stubFetch(() => accepted(1));

    createTracker({ publishableKey: "pk_test" }).jobBoardViewed();
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(1);
  });

  it("flushes immediately once 20 events are queued", async () => {
    stubBrowser();
    const { calls } = stubFetch(() => accepted(20));

    const tracker = createTracker({ publishableKey: "pk_test" });
    for (let i = 0; i < 19; i++) tracker.jobViewed(`tok_${i}`);
    expect(calls).toHaveLength(0);

    tracker.jobViewed("tok_19");
    expect(calls).toHaveLength(1);
    expect((calls[0]!.body as { events: unknown[] }).events).toHaveLength(20);

    tracker.jobViewed("tok_20");
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(2);
    expect((calls[1]!.body as { events: unknown[] }).events).toHaveLength(1);
  });

  it("dedupes applicationStarted per job", async () => {
    stubBrowser();
    const { calls } = stubFetch(() => accepted(2));

    const tracker = createTracker({ publishableKey: "pk_test" });
    tracker.applicationStarted("tok_1");
    tracker.applicationStarted("tok_1");
    tracker.applicationStarted("tok_2");
    tracker.applicationSubmitted("tok_1");
    tracker.applicationSubmitted("tok_1");
    await tracker.flush();

    const names = (calls[0]!.body as { events: { name: string; job: string }[] }).events.map(
      (event) => `${event.name}:${event.job}`
    );
    expect(names).toEqual([
      "application.started:tok_1",
      "application.started:tok_2",
      "application.submitted:tok_1",
      "application.submitted:tok_1",
    ]);
  });

  it("flushes when the page is hidden", async () => {
    const browser = stubBrowser();
    const { calls } = stubFetch(() => accepted(1));

    createTracker({ publishableKey: "pk_test" }).jobViewed("tok_1");
    browser.document.visibilityState = "hidden";
    browser.fire("visibilitychange");

    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(1);
  });

  it("does not flush on a visibilitychange back to visible", () => {
    const browser = stubBrowser();
    const { calls } = stubFetch(() => accepted(1));

    createTracker({ publishableKey: "pk_test" }).jobViewed("tok_1");
    browser.fire("visibilitychange");

    expect(calls).toHaveLength(0);
  });

  it("flushes on pagehide", () => {
    const browser = stubBrowser();
    const { calls } = stubFetch(() => accepted(1));

    createTracker({ publishableKey: "pk_test" }).jobViewed("tok_1");
    browser.fire("pagehide");

    expect(calls).toHaveLength(1);
  });

  it("registers page listeners once, on first track", () => {
    const browser = stubBrowser();
    const addEventListener = vi.spyOn(browser.document, "addEventListener");
    stubFetch(() => accepted(1));

    const tracker = createTracker({ publishableKey: "pk_test" });
    expect(addEventListener).not.toHaveBeenCalled();
    tracker.jobViewed("tok_1");
    tracker.jobViewed("tok_2");
    expect(addEventListener).toHaveBeenCalledTimes(1);
  });
});

describe("failures", () => {
  it("reports a fetch rejection to onError as KitNetworkError without throwing", async () => {
    stubBrowser();
    const boom = new TypeError("fetch failed");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(boom)));
    const onError = vi.fn();

    const tracker = createTracker({ publishableKey: "pk_test", onError });
    tracker.jobViewed("tok_1");
    await expect(tracker.flush()).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledTimes(1);
    const error = onError.mock.calls[0]![0] as KitNetworkError;
    expect(error).toBeInstanceOf(KitNetworkError);
    expect(error.cause).toBe(boom);
  });

  it("reports a non-2xx response to onError as KitApiError", async () => {
    stubBrowser();
    stubFetch(() =>
      jsonResponse({ error: { code: "origin_not_allowed", message: "Origin not allowed" } }, 403)
    );
    const onError = vi.fn();

    const tracker = createTracker({ publishableKey: "pk_test", onError });
    tracker.jobViewed("tok_1");
    await tracker.flush();

    const error = onError.mock.calls[0]![0] as KitApiError;
    expect(error).toBeInstanceOf(KitApiError);
    expect(error.status).toBe(403);
    expect(error.code).toBe("origin_not_allowed");
  });

  it("reports each rejected entry of a 202 to onError, naming the event and job", async () => {
    stubBrowser();
    stubFetch(() =>
      jsonResponse({ accepted: 1, rejected: [{ index: 1, code: "unknown_job" }] }, 202)
    );
    const onError = vi.fn();

    const tracker = createTracker({ publishableKey: "pk_test", onError });
    tracker.jobBoardViewed();
    tracker.jobViewed("tok_typo");
    await tracker.flush();

    expect(onError).toHaveBeenCalledTimes(1);
    const error = onError.mock.calls[0]![0] as Error;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/job\.viewed/);
    expect(error.message).toMatch(/tok_typo/);
    expect(error.message).toMatch(/unknown_job/);
  });

  it("swallows failures silently when no onError is given", async () => {
    stubBrowser();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));

    const tracker = createTracker({ publishableKey: "pk_test" });
    tracker.jobViewed("tok_1");

    await expect(tracker.flush()).resolves.toBeUndefined();
  });

  it("reports an unparseable baseUrl to onError and becomes a no-op instead of throwing", async () => {
    stubBrowser();
    const { calls } = stubFetch(() => accepted(1));
    const onError = vi.fn();

    const tracker = createTracker({ publishableKey: "pk_test", baseUrl: "not a url", onError });
    tracker.jobViewed("tok_1");
    await tracker.flush();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0]![0] as Error).message).toMatch(/not a url/);
    expect(calls).toHaveLength(0);
  });

  it("survives an onError that throws", async () => {
    stubBrowser();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));

    const tracker = createTracker({
      publishableKey: "pk_test",
      onError: () => {
        throw new Error("handler bug");
      },
    });
    tracker.jobViewed("tok_1");

    await expect(tracker.flush()).resolves.toBeUndefined();
  });
});
