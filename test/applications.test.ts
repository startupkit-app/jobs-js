import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, KitApiError } from "../src/index";
import { jsonResponse, stubFetch } from "./helpers";

const client = () => createClient({ publishableKey: "pk_test" });

const submitted = {
  id: "app_123",
  status: "submitted",
  job: "tok_abc",
  submitted_at: "2026-06-11T12:00:00Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apply", () => {
  it("POSTs the application envelope to the job's applications path", async () => {
    const { calls } = stubFetch(() => jsonResponse(submitted, 201));

    const input = {
      email: "jane@example.com",
      first_name: "Jane",
      last_name: "Doe",
      phone: "+48123123123",
      responses: { motivation: "I like shipping." },
      resume_signed_id: "signed-abc",
      files: { portfolio: "signed-def" },
    };
    const result = await client().apply("tok_abc", input);

    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url.pathname).toBe("/api/public/v1/jobs/tok_abc/applications");
    expect(calls[0]!.body).toEqual({ application: input });
    expect(result).toEqual(submitted);
  });

  it("passes turnstile_token at the top level when provided", async () => {
    const { calls } = stubFetch(() => jsonResponse(submitted, 201));

    await client().apply(
      "tok_abc",
      { email: "jane@example.com" },
      { turnstileToken: "ts-token-1" }
    );

    expect(calls[0]!.body).toEqual({
      application: { email: "jane@example.com" },
      turnstile_token: "ts-token-1",
    });
  });

  it("omits turnstile_token when not provided", async () => {
    const { calls } = stubFetch(() => jsonResponse(submitted, 201));

    await client().apply("tok_abc", { email: "jane@example.com" });

    expect(calls[0]!.body).toEqual({
      application: { email: "jane@example.com" },
    });
  });

  it("surfaces 409 already_applied as a KitApiError", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          error: {
            code: "already_applied",
            message: "You have already applied to this job.",
          },
        },
        409
      )
    );

    const error = await client()
      .apply("tok_abc", { email: "jane@example.com" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KitApiError);
    expect((error as KitApiError).status).toBe(409);
    expect((error as KitApiError).code).toBe("already_applied");
  });

  it("exposes per-field validation errors on KitApiError#fields", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          error: {
            code: "validation_failed",
            message: "Validation failed",
            fields: { email: ["is invalid"], responses: ["motivation is required"] },
          },
        },
        422
      )
    );

    const error = await client()
      .apply("tok_abc", { email: "nope" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KitApiError);
    expect((error as KitApiError).fields).toEqual({
      email: ["is invalid"],
      responses: ["motivation is required"],
    });
  });
});
