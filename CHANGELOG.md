# @startupkit-app/jobs

## 0.5.0

### Minor Changes

- Add `createTracker` — a browser tracker that feeds Kit's job analytics from a
  headless job site.

  Kit's **Hiring → Analytics** dashboard (views, unique visitors, traffic sources,
  UTM campaigns, countries, devices, landing pages, view → apply funnel) was fed
  only by Kit's hosted career portal, so sites built on this SDK showed an empty
  dashboard. The tracker posts five typed events straight from the visitor's
  browser and Kit records them as the same events the hosted portal writes, so
  every existing chart fills in unchanged.

  ```ts
  import { createTracker } from "@startupkit-app/jobs";

  const tracker = createTracker({ publishableKey: process.env.NEXT_PUBLIC_KIT_PUBLISHABLE_KEY });

  tracker.jobBoardViewed();                // jobs list page
  tracker.jobViewed(job.id);               // job detail page
  tracker.applicationStarted(job.id);      // first interaction with the apply form (deduped per job)
  tracker.applicationSubmitted(job.id);    // after `apply` resolved
  tracker.talentPoolJoined();              // after `joinTalentPool` resolved
  ```

  Events are batched (1 s window, or immediately at 20) and flushed with
  `fetch(…, { keepalive: true })` when the tab is hidden or the page unloads.
  Nothing throws: outside a browser, without a key, or with `enabled: false` the
  tracker is a no-op, and network errors, non-2xx responses and per-event
  rejections (e.g. `unknown_job` for a mistyped token) go to `onError`.
  Publishable (`pk_…`) keys only: visitor identity and geo are read from the
  browser request, so a server relay would count every visitor as your server. A
  secret key throws at construction.

  New exports: `createTracker`, `KitTracker`, `TrackerOptions`, `TrackEvent`,
  `TrackEventName`. No existing API changed.

  **Requires the matching Kit server release** — the endpoint 404s without it
  (the tracker reports that via `onError` and never breaks the page).

  ### Upgrade guide

  1. `npm i @startupkit-app/jobs@^0.5.0` (on 0.x a caret does not cross minors,
     so an existing `^0.4.0` range will not pick this up by itself).
  2. In Kit, open **Hiring → Settings → Public API Keys**. Reuse the publishable
     key your site already calls the API with, or create one. If the key has an
     origin allowlist, it must include your site's origin (e.g.
     `https://careers.example.com`) — the tracker sends from the browser, so a
     missing origin is a 403 `origin_not_allowed`.
  3. Expose the `pk_…` key to the browser bundle, e.g.
     `NEXT_PUBLIC_KIT_PUBLISHABLE_KEY=pk_live_…`.
  4. Create one tracker module and import it everywhere:

     ```ts
     // lib/kit-tracker.ts
     import { createTracker } from "@startupkit-app/jobs";

     export const tracker = createTracker({
       publishableKey: process.env.NEXT_PUBLIC_KIT_PUBLISHABLE_KEY,
       onError: (error) => console.warn("Kit analytics:", error),
     });
     ```

     It is safe at module scope: on the server (SSR, edge, build) it is a no-op.
  5. Call the five methods where the things happen:

     ```tsx
     // Jobs list page
     useEffect(() => tracker.jobBoardViewed(), []);

     // Job detail page — job.id is the public token from listJobs / getJob
     useEffect(() => tracker.jobViewed(job.id), [job.id]);

     // Apply form — first focus on any field; repeat calls are deduped
     <form onFocus={() => tracker.applicationStarted(job.id)} onSubmit={onSubmit}>

     // After a successful apply
     const result = await kit.apply(job.id, input, { turnstileToken });
     tracker.applicationSubmitted(job.id);

     // After a successful talent-pool signup
     await kit.joinTalentPool(input, { turnstileToken });
     tracker.talentPoolJoined();
     ```

     Using a consent manager? Pass `enabled: consent.analytics` and recreate the
     tracker when it changes.
  6. Verify: open a job page on your site. DevTools → Network shows
     `POST /api/public/v1/events` → `202` within a second; Kit → **Hiring →
     Analytics** shows the view within a minute. A `401`, `403` or `404` lands in
     `onError` with the code.

  Not breaking: no existing function, type or error changed; the tracker is
  additive and tree-shakes away if unused.

  ### Prompt for your AI coding agent

  ````text
  Upgrade this job site to @startupkit-app/jobs ^0.5.0 and wire up Kit's browser analytics tracker.

  1. Run `npm i @startupkit-app/jobs@^0.5.0` (or the equivalent for this repo's package manager) and confirm package.json now has a range that includes 0.5.0.
  2. Find how this site already reads its Kit publishable key (pk_…) for the browser (an env var such as NEXT_PUBLIC_KIT_PUBLISHABLE_KEY, or a config file). Reuse it. Never use a secret key (sk_…) in browser code — createTracker throws on one.
  3. Create ONE tracker module (e.g. lib/kit-tracker.ts) that exports `tracker = createTracker({ publishableKey, onError: (error) => console.warn("Kit analytics:", error) })`. It is safe at module scope: without a key, or on the server, it is a no-op, so it must not be wrapped in guards or try/catch.
  4. Call the five methods at exactly these places, using `job.id` (the public token returned by listJobs/getJob) for the job argument:
     - `tracker.jobBoardViewed()` once when the jobs list page renders in the browser (e.g. useEffect with []).
     - `tracker.jobViewed(job.id)` once when a job detail page renders in the browser (e.g. useEffect keyed on job.id).
     - `tracker.applicationStarted(job.id)` on the first interaction with the apply form (onFocus on the form element is enough; the tracker dedupes per job).
     - `tracker.applicationSubmitted(job.id)` immediately after `kit.apply(...)` resolves successfully, never on failure.
     - `tracker.talentPoolJoined()` immediately after `kit.joinTalentPool(...)` resolves successfully, never on failure.
  5. If the site has a cookie/consent manager, pass `enabled` from its analytics consent state instead of gating the calls yourself.
  6. Do not change any existing API calls; nothing else in the SDK changed.
  7. Verify: run the site, open a job page, and confirm in DevTools → Network a `POST /api/public/v1/events` returning 202. If it returns 401/403, the key or its allowed origins are wrong in Kit (Hiring → Settings → Public API Keys); if 404, the Kit server is not on a release that has the endpoint yet — the page still works either way.
  ````

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
