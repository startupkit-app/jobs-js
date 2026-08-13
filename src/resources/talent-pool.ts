import type { Http } from "../client";
import type {
  RequestOptions,
  TalentPoolForm,
  TalentPoolInput,
  TalentPoolResult,
} from "../types";

export function getTalentPool(
  http: Http,
  options?: RequestOptions
): Promise<TalentPoolForm> {
  return http.request<TalentPoolForm>("GET", "/api/public/v1/talent_pool", {
    request: options,
  });
}

export function joinTalentPool(
  http: Http,
  input: TalentPoolInput,
  opts: { turnstileToken?: string } = {}
): Promise<TalentPoolResult> {
  const body: { talent_pool_entry: TalentPoolInput; turnstile_token?: string } = {
    talent_pool_entry: input,
  };
  if (opts.turnstileToken !== undefined) {
    body.turnstile_token = opts.turnstileToken;
  }

  return http.request<TalentPoolResult>(
    "POST",
    "/api/public/v1/talent_pool/entries",
    { body }
  );
}
