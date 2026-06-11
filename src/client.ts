import { KitApiError, KitNetworkError } from "./errors";
import { isBrowser } from "./internal/env";
import { listJobs, allJobs, getJob } from "./resources/jobs";
import { createUpload, uploadFile } from "./resources/uploads";
import { apply } from "./resources/applications";
import type {
  ApplicationInput,
  ApplicationResult,
  ClientOptions,
  ErrorEnvelope,
  Job,
  JobDetail,
  ListJobsParams,
  Page,
  UploadMeta,
  UploadTicket,
} from "./types";

export const DEFAULT_BASE_URL = "https://app.startupkit.app";

/** Internal HTTP transport shared by the resource modules. */
export interface Http {
  request<T>(
    method: "GET" | "POST",
    path: string,
    options?: {
      query?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
    }
  ): Promise<T>;
}

/** The client returned by `createClient`. */
export interface KitJobsClient {
  /** Lists published jobs, one page at a time. */
  listJobs(params?: ListJobsParams): Promise<Page<Job>>;
  /** Iterates every published job across all pages. */
  allJobs(params?: ListJobsParams): AsyncIterable<Job>;
  /** Fetches full job detail (description, stages, application form). */
  getJob(publicToken: string): Promise<JobDetail>;
  /** Low-level: registers a blob and returns direct-upload instructions. */
  createUpload(meta: UploadMeta): Promise<UploadTicket>;
  /**
   * High-level resume/file upload: computes the base64 MD5 checksum,
   * registers the blob, PUTs the bytes to storage, and returns the
   * `signed_id` to pass in `apply`.
   */
  uploadFile(
    file: Blob | File,
    meta?: { filename?: string; content_type?: string }
  ): Promise<{ signed_id: string }>;
  /** Submits an application to a job. */
  apply(
    publicToken: string,
    input: ApplicationInput,
    opts?: { turnstileToken?: string }
  ): Promise<ApplicationResult>;
}

async function toApiError(response: Response): Promise<KitApiError> {
  let code = "unknown_error";
  let message = `Request failed with status ${response.status}`;
  let fields: Record<string, string[]> | undefined;

  try {
    const payload = (await response.json()) as Partial<ErrorEnvelope> | null;
    const error = payload?.error;
    if (error && typeof error === "object") {
      if (typeof error.code === "string") code = error.code;
      if (typeof error.message === "string") message = error.message;
      if (error.fields && typeof error.fields === "object") fields = error.fields;
    }
  } catch {
    // Non-JSON error body (proxy error page, etc.) — keep the fallback.
  }

  return new KitApiError({ status: response.status, code, message, fields });
}

function createHttp(baseUrl: string, apiKey: string): Http {
  return {
    async request(method, path, options = {}) {
      const url = new URL(path, baseUrl);
      if (options.query) {
        for (const [key, value] of Object.entries(options.query)) {
          if (value !== undefined) url.searchParams.set(key, String(value));
        }
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      };

      const init: RequestInit = { method, headers };
      if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(options.body);
      }

      let response: Response;
      try {
        response = await fetch(url.toString(), init);
      } catch (cause) {
        throw new KitNetworkError(`Request to ${url} failed`, { cause });
      }

      if (!response.ok) throw await toApiError(response);

      try {
        return (await response.json()) as never;
      } catch (cause) {
        throw new KitNetworkError(
          `Could not parse JSON response from ${url}`,
          { cause }
        );
      }
    },
  };
}

/**
 * Creates a Kit public jobs API client.
 *
 * Pass exactly one of `publishableKey` (`pk_…`, browser-safe) or
 * `secretKey` (`sk_…`, server-only). Using a secret key in a browser
 * throws immediately.
 */
export function createClient(options: ClientOptions): KitJobsClient {
  const { publishableKey, secretKey, baseUrl = DEFAULT_BASE_URL } = options;

  if (publishableKey && secretKey) {
    throw new Error(
      "@startupkit/jobs: pass either publishableKey or secretKey, not both."
    );
  }

  const apiKey = secretKey ?? publishableKey;
  if (!apiKey) {
    throw new Error(
      "@startupkit/jobs: either publishableKey (pk_…) or secretKey (sk_…) is required."
    );
  }

  if (secretKey && isBrowser()) {
    throw new Error(
      "@startupkit/jobs: secretKey (sk_…) must never be used in a browser — it would be exposed to every visitor. Use a publishableKey (pk_…) in browser code and keep the secret key on your server."
    );
  }

  const http = createHttp(baseUrl, apiKey);

  return {
    listJobs: (params) => listJobs(http, params),
    allJobs: (params) => allJobs(http, params),
    getJob: (publicToken) => getJob(http, publicToken),
    createUpload: (meta) => createUpload(http, meta),
    uploadFile: (file, meta) => uploadFile(http, file, meta),
    apply: (publicToken, input, opts) => apply(http, publicToken, input, opts),
  };
}
