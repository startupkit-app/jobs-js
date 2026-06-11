# @startupkit/jobs

## 0.1.0

### Minor Changes

- Initial release: typed, zero-dependency fetch client for Kit's public hiring API.
  - `createClient` with publishable (`pk_…`) / secret (`sk_…`) key handling and browser secret-key guard
  - `listJobs` (paginated with `hasNextPage` / `nextPage()`), `allJobs` async iterator, `getJob`
  - `createUpload` + `uploadFile` (vendored MD5 checksum + direct-upload PUT)
  - `apply` with Turnstile token passthrough
  - Typed errors: `KitApiError` (parsed error envelope) and `KitNetworkError`
