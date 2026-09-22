import { resolveBaseUrl, toApiError } from "./client";
import { KitNetworkError } from "./errors";
import { isBrowser } from "./internal/env";

export type TrackEventName =
  | "job_board.viewed"
  | "job.viewed"
  | "application.started"
  | "application.submitted"
  | "talent_pool.joined";

export type TrackEvent =
  | { name: "job_board.viewed" | "talent_pool.joined" }
  | {
      name: "job.viewed" | "application.started" | "application.submitted";
      /** `Job.id` (the public token) from `listJobs` / `getJob`. */
      job: string;
    };

export interface TrackerOptions {
  /** Publishable key (`pk_…`) only — events must come straight from the visitor's browser. */
  publishableKey: string | undefined;
  /** Defaults to `DEFAULT_BASE_URL`; blank counts as unset. */
  baseUrl?: string;
  /** `false` turns the tracker into a no-op, e.g. until a consent manager says yes. Default `true`. */
  enabled?: boolean;
  /** Batching window in milliseconds. Default `1000`. */
  flushInterval?: number;
  /** Tracking never throws; failures (network, non-2xx, rejected events) land here. */
  onError?: (error: unknown) => void;
}

/** The tracker returned by `createTracker`. Every method is safe to call anywhere; nothing throws. */
export interface KitTracker {
  /** The jobs list page rendered. */
  jobBoardViewed(): void;
  /** A job detail page rendered. */
  jobViewed(job: string): void;
  /** First interaction with the apply form. Deduped per job for this tracker instance. */
  applicationStarted(job: string): void;
  /** `apply` resolved successfully. */
  applicationSubmitted(job: string): void;
  /** `joinTalentPool` resolved successfully. */
  talentPoolJoined(): void;
  /** Queues an event; sent with the next batch. */
  track(event: TrackEvent): void;
  /** Sends everything queued now and resolves once every in-flight batch settled. */
  flush(): Promise<void>;
}

type QueuedEvent = TrackEvent & { url: string; referrer?: string; time: string };

interface EventsResponse {
  accepted?: number;
  rejected?: Array<{ index: number; code: string }>;
}

const MAX_BATCH = 20;

const noop = (): void => {};

function noopTracker(): KitTracker {
  return {
    jobBoardViewed: noop,
    jobViewed: noop,
    applicationStarted: noop,
    applicationSubmitted: noop,
    talentPoolJoined: noop,
    track: noop,
    flush: () => Promise.resolve(),
  };
}

/**
 * Creates a browser tracker that feeds Kit's job analytics from a headless
 * job site. Outside a browser, or without a key, it is a silent no-op.
 */
export function createTracker(options: TrackerOptions): KitTracker {
  const {
    publishableKey,
    baseUrl,
    enabled = true,
    flushInterval = 1000,
    onError,
  } = options;

  if (publishableKey?.startsWith("sk_")) {
    throw new Error(
      "@startupkit-app/jobs: createTracker takes a publishableKey (pk_…). A secret key (sk_…) must never be used in a browser — it would be exposed to every visitor."
    );
  }

  if (!isBrowser() || !enabled) return noopTracker();

  if (!publishableKey) {
    console.warn(
      "@startupkit-app/jobs: createTracker called without a publishableKey — analytics are disabled."
    );
    return noopTracker();
  }

  let endpoint: string;
  try {
    endpoint = new URL("/api/public/v1/events", resolveBaseUrl(baseUrl)).toString();
  } catch (cause) {
    report(
      new Error(
        `@startupkit-app/jobs: createTracker got an invalid baseUrl "${baseUrl}" — analytics are disabled.`,
        { cause }
      )
    );
    return noopTracker();
  }

  const queue: QueuedEvent[] = [];
  const pending = new Set<Promise<void>>();
  const started = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let listening = false;

  function report(error: unknown): void {
    try {
      onError?.(error);
    } catch {
      // A throwing onError must not turn into a tracking failure.
    }
  }

  async function send(events: QueuedEvent[]): Promise<void> {
    let response: Response;
    try {
      // keepalive lets a pagehide flush outlive the page; sendBeacon cannot
      // send Authorization and always uses credentialed CORS.
      response = await fetch(endpoint, {
        method: "POST",
        keepalive: true,
        headers: {
          Authorization: `Bearer ${publishableKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ events }),
      });
    } catch (cause) {
      report(new KitNetworkError(`Request to ${endpoint} failed`, { cause }));
      return;
    }

    if (!response.ok) {
      report(await toApiError(response));
      return;
    }

    let payload: EventsResponse | null = null;
    try {
      payload = (await response.json()) as EventsResponse | null;
    } catch {
      return;
    }
    for (const { index, code } of payload?.rejected ?? []) {
      const event = events[index];
      const subject = event && "job" in event ? ` for job "${event.job}"` : "";
      report(
        new Error(
          `@startupkit-app/jobs: Kit rejected event "${event?.name ?? index}"${subject}: ${code}`
        )
      );
    }
  }

  function flush(): Promise<void> {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    while (queue.length > 0) {
      const request: Promise<void> = send(queue.splice(0, MAX_BATCH)).then(() => {
        pending.delete(request);
      });
      pending.add(request);
    }
    return Promise.all(pending).then(noop);
  }

  function listen(): void {
    if (listening) return;
    listening = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void flush();
    });
    window.addEventListener("pagehide", () => void flush());
  }

  function track(event: TrackEvent): void {
    try {
      listen();
      const queued: QueuedEvent = {
        ...event,
        url: location.href,
        time: new Date().toISOString(),
      };
      if (document.referrer) queued.referrer = document.referrer;
      queue.push(queued);

      if (queue.length >= MAX_BATCH) void flush();
      else timer ??= setTimeout(() => void flush(), flushInterval);
    } catch (error) {
      report(error);
    }
  }

  return {
    jobBoardViewed: () => track({ name: "job_board.viewed" }),
    jobViewed: (job) => track({ name: "job.viewed", job }),
    applicationStarted: (job) => {
      if (started.has(job)) return;
      started.add(job);
      track({ name: "application.started", job });
    },
    applicationSubmitted: (job) => track({ name: "application.submitted", job }),
    talentPoolJoined: () => track({ name: "talent_pool.joined" }),
    track,
    flush,
  };
}
