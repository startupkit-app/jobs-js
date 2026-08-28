# @startupkit-app/jobs

## 0.4.0

### Minor Changes

- Expose optional one-time hiring-stage compensation on `JobDetail.stages`.

  Paid stages now include `compensation: { amount, currency }`; unpaid stages
  omit the property. The amount is a JSON number in whole currency units and the
  currency is the employer's configured currency code. This is separate from the role's recurring
  `salary`:

  ```ts
  for (const stage of job.stages) {
    if (stage.compensation) {
      renderStagePayment(stage.compensation.amount, stage.compensation.currency);
    }
  }
  ```

  New exported type: `StageCompensation`. Requires the matching Kit server
  release; older servers remain compatible because `compensation` is optional.

## 0.3.0

### Minor Changes

- Add `getTalentPool` and `joinTalentPool` — keep good candidates on file when no
  posting fits them today.

  `getTalentPool()` returns the intake schema to render: `accepting_signups`,
  `fields`, `resume` constraints, `turnstile`, and `consent`.
  `joinTalentPool(input)` submits the entry and returns
  `{ id, status: "pending_verification", submitted_at }` — the entry is unverified
  until the person clicks Kit's double-opt-in email, and the response echoes back
  no personal data.

  Three things to get right:
  - **Consent is a fact, not a flag.** Render `consent.disclosure_html` as the
    label of a real checkbox that starts unchecked, and send its actual state. A
    hardcoded `true` produces a consent record you cannot defend; an omitted or
    `false` value is rejected with a 422 `consent_required` rather than stored.
  - **Server-side callers should pass `consent_ip_address`** — the first hop of
    `x-forwarded-for`. Without it every consent receipt names your server's egress
    IP instead of the person's. It is caller-asserted, so it is honoured only for
    secret (`sk_…`) keys and ignored for publishable ones; malformed values are
    rejected with a 422 `invalid_consent_ip`.
  - **CVs reuse the existing upload flow.** `createUpload` / `uploadFile`
    unchanged, then pass the returned `signed_id` as `resume_signed_id`.

  New error codes: `already_in_talent_pool` (409), `bot_protection_required`
  (403), and 429 above 5 signups per hour per IP. New exported types:
  `TalentPoolForm`, `TalentPoolConsent`, `TalentPoolField`, `TalentPoolResume`,
  `TalentPoolInput`, `TalentPoolResult`. Requires the matching Kit server release —
  the endpoints 404 without it.

- Raise the minimum supported Node from 18.17 to 20.19.0; CI now tests 20, 22 and 24.

  Node 18 is end of life and the test toolchain (vitest 4, vite 8) no longer runs
  on it, so `>=18.17` claimed support nothing verified. Declaration only — the
  client uses `fetch` and no Node built-ins, so it may well still work on 18, but
  that is untested and unsupported. Installing on 18 now warns `EBADENGINE`, or
  fails outright under `engine-strict`.

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
