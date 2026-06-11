import { vi } from "vitest";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export interface RecordedCall {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  rawBody: BodyInit | null | undefined;
}

/**
 * Stubs global fetch with a queue of responses and records every call
 * (URL, method, headers, parsed JSON body).
 */
export function stubFetch(
  responder: (call: RecordedCall, index: number) => Response | Promise<Response>
): { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(init?.headers ?? {})) {
        headers[key] = value as string;
      }
      let body: unknown;
      if (typeof init?.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      const call: RecordedCall = {
        url: new URL(String(input)),
        method: init?.method ?? "GET",
        headers,
        body,
        rawBody: init?.body,
      };
      calls.push(call);
      return responder(call, calls.length - 1);
    })
  );

  return { calls };
}
