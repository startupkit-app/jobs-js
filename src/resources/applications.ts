import type { Http } from "../client";
import { KitApiError, KitInsightError } from "../errors";
import type {
  ApplicationInput,
  ApplicationResult,
  InsightAnswerInput,
  InsightAnswerResult,
} from "../types";

export function apply(
  http: Http,
  publicToken: string,
  input: ApplicationInput,
  opts: { turnstileToken?: string } = {}
): Promise<ApplicationResult> {
  const body: { application: ApplicationInput; turnstile_token?: string } = {
    application: input,
  };
  if (opts.turnstileToken !== undefined) {
    body.turnstile_token = opts.turnstileToken;
  }

  return http.request<ApplicationResult>(
    "POST",
    `/api/public/v1/jobs/${encodeURIComponent(publicToken)}/applications`,
    { body }
  );
}

export async function answerInsight(
  http: Http,
  { token, id, value }: InsightAnswerInput
): Promise<InsightAnswerResult> {
  try {
    return await http.request<InsightAnswerResult>("POST", "/api/public/v1/insight_answers", {
      body: { token, answer: { id, value } },
    });
  } catch (error) {
    if (error instanceof KitApiError && error.status === 422) {
      throw new KitInsightError({
        status: error.status,
        code: error.code,
        message: error.message,
        id: error.id,
      });
    }
    throw error;
  }
}
