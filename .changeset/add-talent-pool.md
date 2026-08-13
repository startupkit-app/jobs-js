---
"@startupkit-app/jobs": minor
---

Add talent-pool support: `getTalentPool` and `joinTalentPool`.

Most people who visit a careers site find no role that fits them today. Until now
the SDK had nothing to offer them — the only write endpoint was an application to a
specific posting, so a good candidate arriving a month before the right opening was
simply lost. The talent pool is where they wait.

`getTalentPool()` returns the intake schema the client must render: whether signups
are open at all (`accepting_signups`), the fields to show, the resume constraints,
the Turnstile config, and the consent terms — the disclosure HTML to display, how
many months the entry is retained, and the privacy policy URL. `joinTalentPool(input)`
submits the entry. Resumes reuse the existing direct-upload flow unchanged: call
`uploadFile`, then pass the returned `signed_id` as `resume_signed_id`.

Entries are created unverified. Kit emails a double-opt-in link, and the result
(`{ id, status: "pending_verification", submitted_at }`) deliberately echoes back no
personal data.

`consent` is a fact about what the person did, not a flag to set. Send the real state
of a checkbox they ticked next to the disclosure — a hardcoded `true` produces a
consent record that cannot be defended. `false` is rejected with a 422
`consent_required` rather than stored.

Servers that post the form on a visitor's behalf can pass `consent_ip_address` so the
end user's IP is recorded as the consenting party instead of the server's egress IP.
Kit cannot verify a caller-asserted IP, so it is honoured only for secret (`sk_…`)
keys; with a publishable key it is ignored in favour of the observed request IP.

New exported types: `TalentPoolForm`, `TalentPoolConsent`, `TalentPoolField`,
`TalentPoolResume`, `TalentPoolInput`, `TalentPoolResult`.

Requires the corresponding Kit server-side release — the endpoints 404 without it.
