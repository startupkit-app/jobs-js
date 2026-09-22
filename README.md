# @startupkit-app/jobs

Typed, zero-dependency JavaScript/TypeScript client for [Kit's](https://startupkit.app) public hiring API. List your published jobs and accept applications from your own careers site — Node, browsers, edge runtimes, any framework.

- **Zero runtime dependencies** — native `fetch` only
- **ESM + CJS**, fully typed, tree-shakeable
- **snake_case wire format preserved** — what the API returns is what you get
- Node `>= 20.19.0`

## Install

```sh
npm install @startupkit-app/jobs
```

## Keys

Create API keys in Kit under **Hiring → Settings → API**. There are two kinds:

| Key | Prefix | Where | CORS |
| --- | --- | --- | --- |
| Publishable | `pk_…` | Browsers | Only from Origins you allowlist |
| Secret | `sk_…` | Servers only | No CORS — never ship to a browser |

Pass exactly one to `createClient`. The SDK throws if you pass both, and throws if it detects a `secretKey` being used in a browser.

## Quickstart (server-side, `sk_…`)

```ts
import { createClient } from "@startupkit-app/jobs";

const kit = createClient({ secretKey: process.env.KIT_SECRET_KEY });

// One page at a time
const page = await kit.listJobs({ department: "Engineering", remote: true });
for (const job of page.data) {
  console.log(job.title, job.location, job.url);
}
if (page.hasNextPage) {
  const next = await page.nextPage()!;
}

// Or iterate everything
for await (const job of kit.allJobs()) {
  console.log(job.id, job.title);
}

// Full detail: description, stages, and the application form definition
const job = await kit.getJob(page.data[0].id);
console.log(job.description_html, job.accepting_applications);
```

## Quickstart (browser, `pk_…` + Turnstile)

Publishable keys are safe to embed in frontend code. If the job's
`application_form.turnstile.required` is `true`, render the
[Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) widget
with `application_form.turnstile.sitekey` and pass the resulting token
through to `apply`:

```ts
import { createClient } from "@startupkit-app/jobs";

const kit = createClient({ publishableKey: "pk_live_…" });

const job = await kit.getJob("tok_abc123");
// Render job.application_form.fields and job.application_form.questions,
// show job.application_form.consent_disclosure_html near the submit button.

const result = await kit.apply(
  job.id,
  {
    email: "jane@example.com",
    first_name: "Jane",
    last_name: "Doe",
    responses: { motivation: "…" }, // keyed by Question.key
  },
  { turnstileToken } // from the Turnstile widget callback
);

console.log(result.id, result.status); // "app_…", "submitted"
```

## Resume upload flow

`uploadFile` does the whole direct-upload dance for you: it computes the
base64 MD5 checksum, registers the blob, `PUT`s the bytes straight to
storage, and hands back the `signed_id` to attach to the application.

```ts
const file = fileInput.files[0]; // or a Blob in Node

// The job's constraints — validate client-side before uploading:
const { required, content_types, max_byte_size } = job.application_form.resume;

const { signed_id } = await kit.uploadFile(file);

await kit.apply(job.id, {
  email: "jane@example.com",
  resume_signed_id: signed_id,
});
```

### Is a resume required?

`application_form.resume.required` tells you whether the posting's hiring
stage mandates a CV. It is always present and always a boolean. Use it to
mark the field and to block submission before you ever call the API — an
application sent without `resume_signed_id` while `required` is `true` is
rejected with a 422 `validation_failed`.

```ts
const { required } = job.application_form.resume;

fileInput.required = required;
label.textContent = required ? "Resume *" : "Resume";

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = fileInput.files[0];

  if (required && !file) {
    showError("A resume is required for this role.");
    return; // don't spend a round-trip on a submission that will 422
  }

  const resume_signed_id = file ? (await kit.uploadFile(file)).signed_id : undefined;
  await kit.apply(job.id, { email, resume_signed_id });
});
```

The resume is **not** listed in `application_form.fields` — it is described
solely by `application_form.resume` and submitted via the dedicated
`resume_signed_id` input, not as one of the form fields.

Need lower-level control? `createUpload(meta)` registers the blob and
returns the `direct_upload.url` + `direct_upload.headers` so you can run
the `PUT` yourself.

## Talent pool

People who like the company but see no role that fits can be kept on file
instead of lost. `getTalentPool` returns the intake schema — which fields to
render, the consent terms, resume constraints, Turnstile config — and
`joinTalentPool` submits the entry.

```ts
const pool = await kit.getTalentPool();

if (!pool.accepting_signups) return; // hide the form entirely

// Render pool.fields, and pool.consent.disclosure_html next to a checkbox.
// pool.consent.retention_months says how long the entry is kept;
// pool.consent.privacy_policy_url may be null.

const resume = checkbox.checked && file ? await kit.uploadFile(file) : undefined;

const entry = await kit.joinTalentPool(
  {
    email: "jane@example.com",
    linkedin_url: "https://linkedin.com/in/jane",
    resume_signed_id: resume?.signed_id,
    consent: consentCheckbox.checked, // never hardcode true — see below
  },
  { turnstileToken } // when pool.turnstile.required
);

console.log(entry.id, entry.status); // "tpe_…", "pending_verification"
```

The entry is created **unverified**: Kit emails a double-opt-in link and the
person is only in the pool once they click it. The response echoes back no
personal data.

### Consent is a fact, not a default

`consent` records what the person actually did. Send the real state of a
ticked checkbox they saw the disclosure next to — never a literal `true`, and
never a checkbox that starts checked. A talent-pool entry is a consent record
you may later have to justify; a hardcoded `true` makes it worthless.

Send `consent: false` and the API rejects the entry with a 422
`consent_required` rather than storing it.

### `consent_ip_address` (secret keys only)

If your own server posts the form on the visitor's behalf, the IP Kit observes
is your egress IP, not theirs. Pass `consent_ip_address` to assert the end
user's IP as the consenting party instead:

```ts
// Server-side, sk_… key. Take the IP from your framework's request object.
await kit.joinTalentPool({
  email,
  consent: form.consent === "on",
  consent_ip_address: requestIp,
});
```

It is **caller-asserted** — Kit cannot verify it — so it is honoured only for
secret (`sk_…`) keys. With a publishable key it is ignored and the observed
request IP is recorded. A malformed value is rejected with a 422
`invalid_consent_ip`.

Signups are rate limited to 5 per hour per IP (429). Other talent-pool codes:
`already_in_talent_pool` (409), `bot_protection_required` (403).

## Job analytics (browser tracker)

Kit's **Hiring → Analytics** dashboard — views, unique visitors, traffic
sources, UTM campaigns, countries, devices, landing pages, and the view → apply
funnel — is fed by page events. Kit's hosted career portal sends them itself; a
site built on this SDK has to, or the dashboard stays empty. `createTracker`
does it: five typed events, batched and posted straight from the visitor's
browser, recorded by Kit as the same events the hosted portal writes.

```ts
import { createTracker } from "@startupkit-app/jobs";

// One per site. Safe at module scope: on the server, or without a key, it is a no-op.
export const tracker = createTracker({
  publishableKey: process.env.NEXT_PUBLIC_KIT_PUBLISHABLE_KEY,
  onError: (error) => console.warn("Kit analytics:", error),
});
```

Then, with `job.id` being the public token from `listJobs` / `getJob`:

| Call | Where |
| --- | --- |
| `tracker.jobBoardViewed()` | jobs list page rendered |
| `tracker.jobViewed(job.id)` | job detail page rendered |
| `tracker.applicationStarted(job.id)` | first focus on the apply form (deduped per job) |
| `tracker.applicationSubmitted(job.id)` | after `apply` resolved |
| `tracker.talentPoolJoined()` | after `joinTalentPool` resolved |

Next.js / React:

```tsx
import { tracker } from "@/lib/kit-tracker";

// app/jobs/page.tsx
useEffect(() => tracker.jobBoardViewed(), []);

// app/jobs/[id]/page.tsx
useEffect(() => tracker.jobViewed(job.id), [job.id]);

<form onFocus={() => tracker.applicationStarted(job.id)} onSubmit={onSubmit}>

async function onSubmit() {
  const result = await kit.apply(job.id, input, { turnstileToken });
  tracker.applicationSubmitted(job.id);
}
```

Plain HTML:

```html
<script type="module">
  import { createTracker } from "https://esm.sh/@startupkit-app/jobs@0.5";

  const jobId = new URLSearchParams(location.search).get("job");
  const tracker = createTracker({ publishableKey: "pk_live_…" });

  tracker.jobViewed(jobId);
  document.querySelector("form").addEventListener("focusin", () =>
    tracker.applicationStarted(jobId)
  );
</script>
```

Three things to know:

- **Publishable keys only.** Visitor identity (masked IP + user agent) and geo
  are read from the browser's request, so relaying events through your server
  would count every visitor as your server. Passing an `sk_…` key throws.
- **Allowed origins.** If the key has an origin allowlist (Hiring → Settings →
  Public API Keys), your site's origin must be on it; otherwise every batch is a
  403 `origin_not_allowed`. Attribution (landing page, referring domain, UTM) is
  anchored on the request Origin, so events for a different host are ignored.
- **Nothing throws.** Tracking never breaks the page. Outside a browser,
  without a key, or with `enabled: false` (wire it to your consent manager) the
  tracker is a no-op. Network errors, non-2xx responses, and per-event
  rejections such as `unknown_job` for a mistyped token go to `onError`.

Events are batched for `flushInterval` ms (default 1000) or until 20 are
queued, and flushed with `fetch(…, { keepalive: true })` when the tab is hidden
or the page unloads. `flush()` sends what is queued now and resolves once every
in-flight batch settled. Each event carries `url` (`location.href`), `referrer`
and an ISO `time`, all captured when you call it.

## Error handling

Non-2xx API responses throw `KitApiError`; failures that never reach the
API (network, DNS, the direct-upload `PUT`) throw `KitNetworkError`.

```ts
import { KitApiError, KitNetworkError } from "@startupkit-app/jobs";

try {
  await kit.apply(job.id, { email });
} catch (error) {
  if (error instanceof KitApiError) {
    switch (error.code) {
      case "already_applied": // 409
        break;
      case "validation_failed": // 422 — see error.fields
        console.log(error.fields); // { email: ["is invalid"], … }
        break;
      case "turnstile_failed": // 422 — refresh the widget and retry
        break;
      default:
        console.error(error.status, error.code, error.message);
    }
  } else if (error instanceof KitNetworkError) {
    // retry / offline UI
  }
}
```

Error codes: `invalid_key` (401), `origin_not_allowed` (403), `not_found` (404),
`already_applied` (409), `validation_failed` / `turnstile_failed` /
`invalid_content_type` / `file_too_large` (422), `parameter_missing` (400).

## API

```ts
createClient({ publishableKey?, secretKey?, baseUrl? }): KitJobsClient

client.listJobs(params?): Promise<Page<Job>>
client.allJobs(params?): AsyncIterable<Job>
client.getJob(publicToken): Promise<JobDetail>
client.createUpload(meta): Promise<UploadTicket>
client.uploadFile(file, meta?): Promise<{ signed_id: string }>
client.apply(publicToken, input, opts?): Promise<ApplicationResult>
client.getTalentPool(): Promise<TalentPoolForm>
client.joinTalentPool(input, opts?): Promise<TalentPoolResult>

createTracker({ publishableKey, baseUrl?, enabled?, flushInterval?, onError? }): KitTracker

tracker.jobBoardViewed(): void
tracker.jobViewed(job): void
tracker.applicationStarted(job): void
tracker.applicationSubmitted(job): void
tracker.talentPoolJoined(): void
tracker.track(event): void
tracker.flush(): Promise<void>
```

`JobDetail.stages` includes an optional `compensation` object when the employer
offers a one-time payment for completing that stage:

```ts
for (const stage of job.stages) {
  if (stage.compensation) {
    console.log(
      `${stage.name}: ${stage.compensation.amount} ${stage.compensation.currency}`,
    );
  }
}
```

Stage compensation is separate from the role's recurring `salary` and is omitted
for unpaid stages.

All request/response types (`Job`, `JobDetail`, `ApplicationInput`,
`ApplicationResult`, `Page`, `FormField`, `Question`, `StageCompensation`,
`KitTracker`, `TrackerOptions`, `TrackEvent`, …) are exported.

## Examples

- [`examples/node-list-jobs.ts`](examples/node-list-jobs.ts) — server-side listing
- [`examples/browser-apply.html`](examples/browser-apply.html) — browser form with Turnstile + resume upload
- [`examples/browser-track.html`](examples/browser-track.html) — job page feeding Kit's analytics (view → started → submitted)

## Releasing (maintainers)

Releases publish to npm via **GitHub Actions + npm Trusted Publishing (OIDC)** —
no `NPM_TOKEN` secret, provenance attached automatically.

1. Bump the version (`npm version patch|minor|major`) and merge to `main`.
2. The `Release` workflow publishes the new version via OIDC.

The workflow is idempotent — it only publishes when `package.json`'s version
isn't already on the registry, and is gated behind the repo variable
`NPM_PUBLISH_ENABLED`. The initial `0.1.0` was published locally (npm requires a
package to exist before a Trusted Publisher can be configured); every release
after is CI-only.

## License

MIT
