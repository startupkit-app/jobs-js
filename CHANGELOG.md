# @startupkit-app/jobs

## 0.2.0

### Minor Changes

- Expose `application_form.resume.required` on `JobDetail`.

  The API has always returned this boolean — it says whether the posting's hiring
  stage mandates a CV — but the SDK's `ResumeRequirements` type did not declare
  it. It is now typed as a non-optional `required: boolean` (the field is always
  present on the wire and never null), so you can mark the resume input as
  required and block submission client-side instead of discovering the constraint
  from a 422 `validation_failed` after the upload.

  ```ts
  const { required } = job.application_form.resume;
  if (required && !file)
    return showError("A resume is required for this role.");
  ```

  This replaces the older convention of looking for a required form field named
  `resume` in `application_form.fields`. The API no longer emits that field and
  ignores it if sent — read `application_form.resume.required` instead.

  Type-only change: no runtime behaviour was modified. It is a minor rather than
  a patch because the added non-optional property can surface a type error in
  code that constructs a `ResumeRequirements` / `ApplicationForm` object literal
  (test fixtures, mocks).

## 0.1.1

### Patch Changes

- `createClient` no longer throws when no key is configured — it constructs and
  defers the error to the first request (with an actionable message). This lets
  the client be instantiated at module scope in serverless/SSG builds where the
  key arrives via runtime env. The both-keys and secret-key-in-browser guards
  stay eager.

## 0.1.0

### Minor Changes

- Initial release: typed, zero-dependency fetch client for Kit's public hiring API.
  - `createClient` with publishable (`pk_…`) / secret (`sk_…`) key handling and browser secret-key guard
  - `listJobs` (paginated with `hasNextPage` / `nextPage()`), `allJobs` async iterator, `getJob`
  - `createUpload` + `uploadFile` (vendored MD5 checksum + direct-upload PUT)
  - `apply` with Turnstile token passthrough
  - Typed errors: `KitApiError` (parsed error envelope) and `KitNetworkError`
