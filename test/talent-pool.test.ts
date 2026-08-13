import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, KitApiError } from "../src/index";
import { jsonResponse, stubFetch } from "./helpers";

const client = () => createClient({ publishableKey: "pk_test" });
const serverClient = () => createClient({ secretKey: "sk_test" });

const form = {
  accepting_signups: true,
  consent: {
    required: true,
    disclosure_html: "<p>Keep my details on file for 24 months…</p>",
    retention_months: 24,
    privacy_policy_url: "https://acme.test/privacy",
  },
  fields: [
    { name: "email", required: true },
    { name: "linkedin_url", required: false },
    { name: "resume_signed_id", required: false },
  ],
  resume: {
    required: false,
    content_types: ["application/pdf"],
    max_byte_size: 10485760,
  },
  turnstile: { required: false, sitekey: null },
};

const created = {
  id: "tpe_9fQ",
  status: "pending_verification",
  submitted_at: "2026-08-13T09:30:00Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getTalentPool", () => {
  it("GETs the talent pool path and returns the wire shape untouched", async () => {
    const { calls } = stubFetch(() => jsonResponse(form));

    const result = await client().getTalentPool();

    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url.pathname).toBe("/api/public/v1/talent_pool");
    expect(result).toEqual(form);
    expect(result.consent.retention_months).toBe(24);
    expect(result.fields[0]).toEqual({ name: "email", required: true });
  });

  it("keeps nullable consent and turnstile values as null", async () => {
    stubFetch(() =>
      jsonResponse({
        ...form,
        accepting_signups: false,
        consent: { ...form.consent, privacy_policy_url: null },
      })
    );

    const result = await client().getTalentPool();

    expect(result.accepting_signups).toBe(false);
    expect(result.consent.privacy_policy_url).toBeNull();
    expect(result.turnstile.sitekey).toBeNull();
  });
});

describe("joinTalentPool", () => {
  it("POSTs the talent_pool_entry envelope to the entries path", async () => {
    const { calls } = stubFetch(() => jsonResponse(created, 201));

    const input = {
      email: "jane@example.com",
      linkedin_url: "https://linkedin.com/in/jane",
      resume_signed_id: "signed-abc",
      consent: true,
    };
    const result = await client().joinTalentPool(input);

    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url.pathname).toBe("/api/public/v1/talent_pool/entries");
    expect(calls[0]!.body).toEqual({ talent_pool_entry: input });
    expect(result).toEqual(created);
  });

  it("passes turnstile_token at the top level when provided", async () => {
    const { calls } = stubFetch(() => jsonResponse(created, 201));

    await client().joinTalentPool(
      { email: "jane@example.com", consent: true },
      { turnstileToken: "ts-token-1" }
    );

    expect(calls[0]!.body).toEqual({
      talent_pool_entry: { email: "jane@example.com", consent: true },
      turnstile_token: "ts-token-1",
    });
  });

  it("omits turnstile_token when not provided", async () => {
    const { calls } = stubFetch(() => jsonResponse(created, 201));

    await client().joinTalentPool({ email: "jane@example.com", consent: true });

    expect(calls[0]!.body).toEqual({
      talent_pool_entry: { email: "jane@example.com", consent: true },
    });
  });

  it("passes consent_ip_address through inside the entry", async () => {
    const { calls } = stubFetch(() => jsonResponse(created, 201));

    await serverClient().joinTalentPool({
      email: "jane@example.com",
      consent: true,
      consent_ip_address: "203.0.113.7",
    });

    expect(calls[0]!.body).toEqual({
      talent_pool_entry: {
        email: "jane@example.com",
        consent: true,
        consent_ip_address: "203.0.113.7",
      },
    });
  });

  it("surfaces 409 already_in_talent_pool as a KitApiError", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          error: {
            code: "already_in_talent_pool",
            message: "This email is already in the talent pool.",
          },
        },
        409
      )
    );

    const error = await serverClient()
      .joinTalentPool({ email: "jane@example.com", consent: true })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KitApiError);
    expect((error as KitApiError).status).toBe(409);
    expect((error as KitApiError).code).toBe("already_in_talent_pool");
  });

  it("surfaces 422 consent_required as a KitApiError", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          error: {
            code: "consent_required",
            message: "Consent is required to join the talent pool.",
          },
        },
        422
      )
    );

    const error = await client()
      .joinTalentPool({ email: "jane@example.com", consent: false })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KitApiError);
    expect((error as KitApiError).status).toBe(422);
    expect((error as KitApiError).code).toBe("consent_required");
  });

  it("exposes per-field validation errors on KitApiError#fields", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          error: {
            code: "validation_failed",
            message: "Validation failed",
            fields: {
              email: ["is invalid"],
              linkedin_url: ["is not a LinkedIn profile"],
            },
          },
        },
        422
      )
    );

    const error = await client()
      .joinTalentPool({ email: "nope", consent: true })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KitApiError);
    expect((error as KitApiError).fields).toEqual({
      email: ["is invalid"],
      linkedin_url: ["is not a LinkedIn profile"],
    });
  });
});
