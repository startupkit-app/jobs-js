import type { Http } from "../client";
import type { ApplicationInput, ApplicationResult } from "../types";

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
