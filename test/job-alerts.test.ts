import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, KitApiError } from "../src/index";
import { jsonResponse, stubFetch } from "./helpers";

const client = createClient({ publishableKey: "pk_test" });
afterEach(() => vi.unstubAllGlobals());

describe("job alerts", () => {
  it("discovers the configuration and forwards fetch cache controls", async () => {
    const form = {
      accepting_subscriptions: true,
      privacy_policy_url: null,
      turnstile: { required: false, sitekey: null },
      talent_pool_url: "https://acme.test/talent-pool",
    };
    const { calls } = stubFetch(() => jsonResponse(form));
    expect(await client.getJobAlerts({ cache: "no-store" })).toEqual(form);
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url.pathname).toBe("/api/public/v1/job_alert_subscriptions");
    expect(vi.mocked(fetch).mock.calls[0]![1]?.cache).toBe("no-store");
  });

  it("submits email, locale and top-level Turnstile without exposing email in the URL", async () => {
    const { calls } = stubFetch(() => jsonResponse({ status: "pending_confirmation" }, 202));
    const input = { email: "jane@example.com", locale: "pl" };
    expect(await client.createJobAlertSubscription(input, { turnstileToken: "challenge" }))
      .toEqual({ status: "pending_confirmation" });
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url.search).toBe("");
    expect(calls[0]!.body).toEqual({ job_alert_subscription: input, turnstile_token: "challenge" });
  });

  it("does not add consent or a talent-pool entry to an alerts request", async () => {
    const { calls } = stubFetch(() => jsonResponse({ status: "pending_confirmation" }, 202));
    await client.createJobAlertSubscription({ email: "jane@example.com" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({ job_alert_subscription: { email: "jane@example.com" } });
  });

  it("preserves validation and rate-limit errors", async () => {
    for (const status of [422, 429]) {
      stubFetch(() => jsonResponse({ error: { code: "validation_failed", message: "Try again", fields: { email: ["is invalid"] } } }, status));
      const error = await client.createJobAlertSubscription({ email: "invalid" }).catch((value: unknown) => value);
      expect(error).toBeInstanceOf(KitApiError);
      expect((error as KitApiError).status).toBe(status);
      expect((error as KitApiError).fields).toEqual({ email: ["is invalid"] });
    }
  });
});
