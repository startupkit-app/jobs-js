/**
 * Error thrown when the API responds with a non-2xx status.
 *
 * Carries the parsed error envelope: `status`, machine-readable `code`,
 * human-readable `message`, and optional per-field validation `fields`.
 *
 * Known codes: `invalid_key` (401), `origin_not_allowed` (403),
 * `not_found` (404), `already_applied` (409), `validation_failed`,
 * `turnstile_failed`, `invalid_content_type`, `file_too_large` (422),
 * `parameter_missing` (400).
 */
export class KitApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string[]>;

  constructor(args: {
    status: number;
    code: string;
    message: string;
    fields?: Record<string, string[]>;
  }) {
    super(args.message);
    this.name = "KitApiError";
    this.status = args.status;
    this.code = args.code;
    if (args.fields !== undefined) this.fields = args.fields;
  }
}

/**
 * Error thrown when the request never produced an API response —
 * DNS failures, refused connections, aborted requests, or a failed
 * direct-upload PUT. The underlying error (if any) is on `cause`.
 */
export class KitNetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "KitNetworkError";
  }
}
