// Server-side example: list every published job with a secret key.
//
//   KIT_SECRET_KEY=sk_… npx tsx examples/node-list-jobs.ts

import { createClient } from "@startupkit/jobs";

const secretKey = process.env.KIT_SECRET_KEY;
if (!secretKey) {
  console.error("Set KIT_SECRET_KEY (sk_…) first.");
  process.exit(1);
}

const kit = createClient({ secretKey });

for await (const job of kit.allJobs({ remote: true })) {
  const salary = job.salary
    ? ` — ${job.salary.min ?? "?"}-${job.salary.max ?? "?"} ${job.salary.currency}/${job.salary.period}`
    : "";
  console.log(`${job.title} (${job.department ?? "No department"}, ${job.location ?? "Anywhere"})${salary}`);
  console.log(`  apply: ${job.url}`);
}
