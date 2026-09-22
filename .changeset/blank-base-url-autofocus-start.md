---
"@startupkit-app/jobs": patch
---

Fix `createTracker` crashing on a blank `baseUrl`, and correct the 0.5.0
guidance for `application.started`, which over-counts on forms with an
autofocused field.

**What broke**

- `createTracker({ publishableKey, baseUrl: "" })` threw `TypeError: Invalid URL`.
  Only a missing `baseUrl` fell back to the default, so an empty env var (e.g.
  copied from a blank `.env.example` line) crashed every client component that
  imports the tracker module. A blank or whitespace `baseUrl` now means "use the
  default"; an unparseable one goes to `onError` and the tracker becomes a no-op.
  Passing an `sk_…` key still throws, on purpose.
- `createClient` had the same fallback gap: a blank `baseUrl` threw
  `TypeError: Invalid URL` on the first request. It now uses the default too.
- The 0.5.0 guide said `onFocus` on the apply form is enough for
  `applicationStarted`. It is not when a field autofocuses: the browser focuses it
  on every page load, so every visit to a job page counted as a started
  application and the view → start funnel reads close to 100%.

**Who is affected:** anyone who passes `baseUrl` from an env var that can be
empty, and anyone who followed the 0.5.0 guide on an apply form with an
`autoFocus` / `autofocus` field. No API changed.

### Upgrade guide

1. `npm i @startupkit-app/jobs@^0.5.1`. An existing `^0.5.0` range picks it up on
   reinstall.
2. Replace the apply form's `onFocus`-only wiring with `onFocus` + `onInput`, and
   skip focus on the autofocused field (typing into it still counts):

   ```tsx
   const autofocused = useRef<HTMLInputElement>(null);

   <form
     onFocus={(e) => {
       if (e.target !== autofocused.current) tracker.applicationStarted(job.id);
     }}
     onInput={() => tracker.applicationStarted(job.id)}
     action={formAction}
   >
     <input ref={autofocused} name="name" autoFocus />
   ```

   Plain DOM: `focusin` with `if (!event.target.autofocus)`, plus `input`.
3. Verify: load a job page with DevTools → Network open and do not touch the
   form. After a second, the `POST /api/public/v1/events` body has `job.viewed`
   and no `application.started`. Type into the autofocused field; the next batch
   has `application.started`, once.

### Prompt for your AI coding agent

This supersedes the 0.5.0 prompt; use it whether or not the tracker is already
wired.

````text
Upgrade this job site to @startupkit-app/jobs ^0.5.1 and make sure Kit's browser analytics tracker is wired correctly. If the tracker is already wired from the 0.5.0 instructions, fix it to match these.

1. Run `npm i @startupkit-app/jobs@^0.5.1` (or this repo's package-manager equivalent) and confirm the lockfile resolves 0.5.1 or later.
2. Key: the tracker needs a PUBLISHABLE key (pk_…) exposed to the browser. Sites derived from the Kit Next.js template usually only have a server secret key (sk_…, e.g. STARTUPKIT_SECRET_KEY); that one must never reach browser code, and createTracker throws on it. If no pk_ key is configured, add a new env var `NEXT_PUBLIC_STARTUPKIT_PUBLISHABLE_KEY` (rename any existing browser pk_ variable to this name for consistency), add it empty to .env.example, and tell me to create or copy the pk_ key in Kit → Hiring → Career Portal → Public API Keys and set it in every environment. If that key has an origin allowlist, the site's origin must be on it, or every batch is a 403. `NEXT_PUBLIC_*` values are inlined at build time, so tell me the site must be redeployed after the key is set.
3. Create or keep ONE tracker module (e.g. lib/kit-tracker.ts) exporting `tracker = createTracker({ publishableKey: process.env.NEXT_PUBLIC_STARTUPKIT_PUBLISHABLE_KEY, onError: (error) => console.warn("Kit analytics:", error) })`. Do not wrap it in guards or try/catch: on the server it is a silent no-op, a blank baseUrl falls back to the default, and without a key it is a no-op that logs one console.warn.
4. Call the methods only in client code (Next.js: "use client" components), with `job.id` (the public token from listJobs/getJob):
   - `tracker.jobBoardViewed()` once when the jobs list page mounts (useEffect with []).
   - `tracker.jobViewed(job.id)` once when a job detail page mounts (useEffect keyed on job.id).
   - `tracker.applicationStarted(job.id)` from BOTH the apply form's `onFocus` and its `onInput`. In `onFocus`, ignore the event when `e.target` is the autofocused field (put a ref on the field with autoFocus/autofocus and compare) — the browser focuses that field on every page load, which would count every visit as a start; typing into it still counts through onInput. If no field autofocuses, keep both handlers without the ref check. The tracker dedupes per job, so repeated calls are fine. Replace any onFocus-only wiring from 0.5.0.
   - `tracker.applicationSubmitted(job.id)` only after the application succeeded, and `tracker.talentPoolJoined()` only after the talent-pool signup succeeded, never on failure. If the form submits through a Next.js Server Action, the server cannot call the tracker: return a success flag from the action and fire the event in a client `useEffect` on the action result (e.g. from useActionState). If the site calls kit.apply / kit.joinTalentPool from the browser, fire right after the promise resolves.
5. If the site has a cookie/consent manager, pass `enabled` from its analytics consent state instead of gating the calls yourself.
6. Do not change any other API calls.
7. Verify with the dev server and a pk_ key set: open a job page and, without touching the form, confirm DevTools → Network shows `POST /api/public/v1/events` → 202 whose body has `job.viewed` and no `application.started`; then type into the form and confirm a later batch carries `application.started` once. 401/403 means the key or its allowed origins are wrong in Kit; 404 means the Kit server lacks the endpoint. The page keeps working in every case.
````
