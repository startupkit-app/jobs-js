import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, KitApiError, KitInsightError } from "../src/index";
import { jsonResponse, stubFetch } from "./helpers";

const client = () => createClient({ publishableKey: "pk_test" });
const serverClient = () => createClient({ secretKey: "sk_test" });

const submitted = {
  id: "app_123",
  status: "submitted",
  job: "tok_abc",
  submitted_at: "2026-06-11T12:00:00Z",
};

const insights = {
  token: "insight-token-1",
  expires_at: "2026-11-23T10:00:00Z",
  questions: [
    { id: "mfd_3k9QpL2x", type: "text", prompt: "Which city are you based in?", max_length: 255 },
    {
      id: "mfd_8Hn2vRt1",
      type: "select",
      prompt: "How long have you used Kotlin with Spring?",
      choices: ["Not yet", "Side projects", "1-2 years", "3+ years"],
      answer: "1-2 years",
    },
    { id: "mfd_5Yc7Mw3e", type: "tags", prompt: "Which tools do you use daily?", max_length: 50, max_tags: 10 },
  ],
};

const saved = {
  answer: { id: "mfd_3k9QpL2x", value: "Kraków", answered_at: "2026-11-09T10:05:00Z" },
  remaining: 2,
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

  it("returns the optional insight questions when the employer asks some", async () => {
    stubFetch(() => jsonResponse({ ...submitted, insights }, 201));

    const result = await client().apply("tok_abc", { email: "jane@example.com" });

    expect(result.insights).toEqual(insights);
    expect(result.insights?.questions[1]?.choices).toEqual([
      "Not yet",
      "Side projects",
      "1-2 years",
      "3+ years",
    ]);
    expect(result.insights?.questions[1]?.answer).toBe("1-2 years");
  });

  it("leaves insights undefined when the response has none", async () => {
    stubFetch(() => jsonResponse(submitted, 201));

    const result = await client().apply("tok_abc", { email: "jane@example.com" });

    expect(result.insights).toBeUndefined();
  });
});

describe("answerInsight", () => {
  it("PATCHes the question's path with the token and the answer in the body", async () => {
    const { calls } = stubFetch(() => jsonResponse(saved));

    const result = await serverClient().answerInsight({
      token: "insight-token-1",
      id: "mfd_3k9QpL2x",
      value: "Kraków",
    });

    expect(calls[0]!.method).toBe("PATCH");
    expect(calls[0]!.url.pathname).toBe("/api/public/v1/insight_answers/mfd_3k9QpL2x");
    expect(calls[0]!.url.search).toBe("");
    expect(calls[0]!.headers["Authorization"]).toBe("Bearer sk_test");
    expect(calls[0]!.rawBody).toBe('{"token":"insight-token-1","answer":{"value":"Kraków"}}');
    expect(result).toEqual(saved);
    expect(result.remaining).toBe(2);
  });

  it("URL-encodes reserved characters in the question id", async () => {
    const { calls } = stubFetch(() => jsonResponse(saved));

    await client().answerInsight({ token: "insight-token-1", id: "mfd_a/b?c#d e", value: "x" });

    expect(calls[0]!.url.pathname).toBe("/api/public/v1/insight_answers/mfd_a%2Fb%3Fc%23d%20e");
    expect(calls[0]!.url.search).toBe("");
    expect(calls[0]!.url.hash).toBe("");
  });

  it.each([[true], [42], [["Kotlin", "Spring"]]])(
    "sends a %j value as-is",
    async (value) => {
      const { calls } = stubFetch(() => jsonResponse(saved));

      await client().answerInsight({ token: "insight-token-1", id: "mfd_5Yc7Mw3e", value });

      expect(calls[0]!.body).toEqual({ token: "insight-token-1", answer: { value } });
    }
  );

  it("throws a KitInsightError carrying the code and question id on 422", async () => {
    stubFetch(() =>
      jsonResponse(
        {
          error: {
            code: "not_a_choice",
            message: "Pick one of the listed options.",
            id: "mfd_8Hn2vRt1",
          },
        },
        422
      )
    );

    const error = await client()
      .answerInsight({ token: "insight-token-1", id: "mfd_8Hn2vRt1", value: "Ages" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KitInsightError);
    expect(error).toBeInstanceOf(KitApiError);
    expect((error as KitInsightError).status).toBe(422);
    expect((error as KitInsightError).code).toBe("not_a_choice");
    expect((error as KitInsightError).id).toBe("mfd_8Hn2vRt1");
    expect((error as KitInsightError).message).toBe("Pick one of the listed options.");
  });

  it("leaves id undefined when the 422 sends a null id", async () => {
    stubFetch(() =>
      jsonResponse(
        { error: { code: "insights_closed", message: "These questions are closed.", id: null } },
        422
      )
    );

    const error = await client()
      .answerInsight({ token: "expired", id: "mfd_3k9QpL2x", value: "Kraków" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KitInsightError);
    expect((error as KitInsightError).code).toBe("insights_closed");
    expect((error as KitInsightError).id).toBeUndefined();
  });

  it("passes through a 422 code this SDK does not know yet", async () => {
    stubFetch(() =>
      jsonResponse(
        { error: { code: "too_vague", message: "Say a bit more.", id: "mfd_3k9QpL2x" } },
        422
      )
    );

    const error = (await client()
      .answerInsight({ token: "insight-token-1", id: "mfd_3k9QpL2x", value: "x" })
      .catch((e: unknown) => e)) as KitInsightError;
    const code: KitInsightError["code"] = "too_vague";

    expect(error).toBeInstanceOf(KitInsightError);
    expect(error.code).toBe(code);
    expect(error.message).toBe("Say a bit more.");
  });

  it("falls back to unknown_error when a 422 body is not JSON", async () => {
    stubFetch(() => new Response("<html>Unprocessable</html>", { status: 422 }));

    const error = (await client()
      .answerInsight({ token: "insight-token-1", id: "mfd_3k9QpL2x", value: "x" })
      .catch((e: unknown) => e)) as KitInsightError;
    const code: KitInsightError["code"] = "unknown_error";

    expect(error).toBeInstanceOf(KitInsightError);
    expect(error.code).toBe(code);
    expect(error.id).toBeUndefined();
  });

  it("keeps non-422 failures as a plain KitApiError", async () => {
    stubFetch(() =>
      jsonResponse({ error: { code: "invalid_key", message: "Invalid API key." } }, 401)
    );

    const error = await client()
      .answerInsight({ token: "insight-token-1", id: "mfd_3k9QpL2x", value: "Kraków" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(KitApiError);
    expect(error).not.toBeInstanceOf(KitInsightError);
    expect((error as KitApiError).code).toBe("invalid_key");
  });
});
