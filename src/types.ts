/**
 * Wire types for Kit's public hiring API (`/api/public/v1`).
 *
 * The wire format is snake_case and is preserved as-is — the SDK does not
 * rename keys.
 */

/** Pagination envelope returned by list endpoints. */
export interface Pagination {
  current_page: number;
  total_pages: number;
  total_count: number;
  per_page: number;
}

/** Salary range attached to a job, when the posting publishes one. */
export interface Salary {
  min: number | null;
  max: number | null;
  currency: string;
  period: string;
}

/** A published job posting as returned by the list endpoint. */
export interface Job {
  /** Public token identifying the job (use it with `getJob` / `apply`). */
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  employment_type: string | null;
  remote: boolean;
  /** ISO 8601 timestamp, or null. */
  published_at: string | null;
  /** Canonical hosted job page URL, or null. */
  url: string | null;
  salary?: Salary;
}

export type FormFieldType =
  | "text"
  | "textarea"
  | "file"
  | "url"
  | "select"
  | "checkbox"
  | "email"
  | "phone";

/** A built-in application form field. */
export interface FormField {
  name: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  max_length?: number;
}

export type QuestionType = "text" | "scenario" | "multiple_choice";

/** A screening question configured on the job posting. */
export interface Question {
  key: string;
  type: QuestionType;
  prompt: string;
  required: boolean;
  max_length: number;
  options?: string[];
}

/** One-time compensation offered for completing a hiring stage. */
export interface StageCompensation {
  /** Amount in whole currency units (for example, `250.5` means 250.50). */
  amount: number;
  /** Currency code configured by the employer, such as `USD` or `EUR`. */
  currency: string;
}

/** A stage in the hiring pipeline (read-only metadata). */
export interface Stage {
  name: string;
  type: string;
  /** Present only when the employer offers compensation for this stage. */
  compensation?: StageCompensation;
}

/** Resume upload constraints for the posting. */
export interface ResumeRequirements {
  /**
   * Whether the posting's first hiring stage mandates a CV. When `true`, an
   * application submitted without `resume_signed_id` is rejected with a 422
   * `validation_failed` — upload the file first and pass the signed id to
   * `apply`. Always present on the wire (never null).
   */
  required: boolean;
  content_types: string[];
  max_byte_size: number;
}

/** Cloudflare Turnstile configuration for browser-side submissions. */
export interface TurnstileConfig {
  required: boolean;
  sitekey: string | null;
}

/** Everything needed to render the application form for a job. */
export interface ApplicationForm {
  fields: FormField[];
  questions: Question[];
  consent_disclosure_html: string;
  resume: ResumeRequirements;
  turnstile: TurnstileConfig;
}

/** Full job detail as returned by `getJob`. */
export interface JobDetail extends Job {
  description_html: string;
  accepting_applications: boolean;
  stages: Stage[];
  application_form: ApplicationForm;
}

/** Filters accepted by `listJobs` / `allJobs`. */
export interface ListJobsParams {
  department?: string;
  location?: string;
  employment_type?: string;
  remote?: boolean;
  page?: number;
  per_page?: number;
}

/** One page of results with cursor-style helpers. */
export interface Page<T> {
  data: T[];
  pagination: Pagination;
  hasNextPage: boolean;
  /** Fetches the next page, or returns `null` when on the last page. */
  nextPage(): Promise<Page<T>> | null;
}

/** Blob metadata for `createUpload`. `checksum` is a base64-encoded MD5. */
export interface UploadMeta {
  filename: string;
  byte_size: number;
  /** Base64-encoded MD5 digest of the file's bytes. */
  checksum: string;
  content_type: string;
}

/** Result of `createUpload` — a signed id plus direct-upload instructions. */
export interface UploadTicket {
  signed_id: string;
  filename: string;
  content_type: string;
  byte_size: number;
  direct_upload: {
    url: string;
    headers: Record<string, string>;
  };
}

/** Application payload for `apply`. */
export interface ApplicationInput {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  /** Answers to screening questions, keyed by `Question.key`. */
  responses?: Record<string, string>;
  /** Signed id from `uploadFile` / `createUpload` for the resume. */
  resume_signed_id?: string;
  /** Extra file fields, keyed by `FormField.name` → signed id. */
  files?: Record<string, string>;
}

/** Result of a successful application submission. */
export interface ApplicationResult {
  /** Application id (`app_…`). */
  id: string;
  status: "submitted";
  /** Public token of the job that was applied to. */
  job: string;
  /** ISO 8601 timestamp. */
  submitted_at: string;
}

/** Consent terms a talent-pool signup must show and record. */
export interface TalentPoolConsent {
  /** Whether `TalentPoolInput.consent` must be `true` for an entry to be accepted. */
  required: boolean;
  /** Retention disclosure to render verbatim next to the consent checkbox. */
  disclosure_html: string;
  /** How long an entry is kept on file, in months. */
  retention_months: number;
  /** The account's privacy policy, or `null` when it publishes none. */
  privacy_policy_url: string | null;
}

/** One field of the talent-pool intake form. */
export interface TalentPoolField {
  /** Wire key to send inside `TalentPoolInput` (`email`, `linkedin_url`, …). */
  name: string;
  /** Whether a blank value is rejected with a 422 `validation_failed`. */
  required: boolean;
}

/**
 * Resume constraints for talent-pool signups. Identical to a job posting's:
 * `required` says whether a CV must accompany the entry, and the file is
 * uploaded through the same direct-upload flow.
 */
export type TalentPoolResume = ResumeRequirements;

/** Everything needed to render the talent-pool signup form. */
export interface TalentPoolForm {
  /** Whether the account is currently taking new entries. */
  accepting_signups: boolean;
  /** Consent terms — display `consent.disclosure_html` beside the checkbox. */
  consent: TalentPoolConsent;
  /** The fields to render, in display order. */
  fields: TalentPoolField[];
  /** Resume constraints — validate client-side before uploading. */
  resume: TalentPoolResume;
  /** Turnstile configuration for browser-side signups. */
  turnstile: TurnstileConfig;
}

/** Talent-pool signup payload for `joinTalentPool`. */
export interface TalentPoolInput {
  /** The candidate's email address. Kit sends a double-opt-in link here. */
  email: string;
  /** LinkedIn profile URL. */
  linkedin_url?: string;
  /** Signed id from `uploadFile` / `createUpload` for the resume. */
  resume_signed_id?: string;
  /**
   * Whether the person affirmatively consented (a ticked checkbox). Never
   * hardcode `true` — the value is recorded as a fact about what they did.
   */
  consent: boolean;
  /**
   * IP of the person who consented, for servers that proxy a browser form.
   * Honoured only for secret (`sk_…`) keys; with a publishable key the
   * observed request IP is recorded instead and this is ignored.
   */
  consent_ip_address?: string;
}

/** Result of a successful talent-pool signup. Echoes back no PII. */
export interface TalentPoolResult {
  /** Talent-pool entry id (`tpe_…`). */
  id: string;
  /** Entries start unverified — Kit emails a double-opt-in link. */
  status: "pending_verification";
  /** ISO 8601 timestamp. */
  submitted_at: string;
}

/** JSON error envelope returned by the API on non-2xx responses. */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
  };
}

/**
 * Per-request fetch options forwarded to the underlying `fetch` on read methods
 * (`listJobs`, `getJob`). `next` integrates with the Next.js data cache (ISR +
 * tag revalidation) and is ignored by runtimes that don't read it.
 */
export interface RequestOptions {
  cache?: RequestCache;
  next?: { revalidate?: number | false; tags?: string[] };
  signal?: AbortSignal;
}

/** Options for `createClient`. Pass exactly one of the two keys. */
export interface ClientOptions {
  /** Publishable key (`pk_…`) — safe for browsers; CORS-restricted by Origin. */
  publishableKey?: string;
  /** Secret key (`sk_…`) — server-side only. Never ship it to a browser. */
  secretKey?: string;
  /** API origin. Defaults to `https://app.startupkit.app`. */
  baseUrl?: string;
}
