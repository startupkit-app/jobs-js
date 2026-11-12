import type { Http } from "../client";
import type {
  JobAlertForm,
  JobAlertSubscriptionInput,
  JobAlertSubscriptionResult,
  RequestOptions,
} from "../types";

const PATH = "/api/public/v1/job_alert_subscriptions";

export function getJobAlerts(http: Http, options?: RequestOptions): Promise<JobAlertForm> {
  return http.request<JobAlertForm>("GET", PATH, { request: options });
}

export function createJobAlertSubscription(
  http: Http,
  input: JobAlertSubscriptionInput,
  opts: { turnstileToken?: string } = {}
): Promise<JobAlertSubscriptionResult> {
  const body: {
    job_alert_subscription: JobAlertSubscriptionInput;
    turnstile_token?: string;
  } = { job_alert_subscription: input };
  if (opts.turnstileToken !== undefined) body.turnstile_token = opts.turnstileToken;
  return http.request<JobAlertSubscriptionResult>("POST", PATH, { body });
}
