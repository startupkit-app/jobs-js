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

/** A stage in the hiring pipeline (read-only metadata). */
export interface Stage {
  name: string;
  type: string;
}

/** Resume upload constraints for the posting. */
export interface ResumeRequirements {
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
