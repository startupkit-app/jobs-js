import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../src/index";
import type { Job } from "../src/index";
import { jsonResponse, stubFetch } from "./helpers";

function job(id: string): Job {
  return {
    id,
    title: `Job ${id}`,
    department: "Engineering",
    location: "Berlin",
    employment_type: "full_time",
    remote: true,
    published_at: "2026-06-01T09:00:00Z",
    url: `https://app.startupkit.app/jobs/${id}`,
  };
}

function pageResponse(ids: string[], current_page: number, total_pages: number) {
  return jsonResponse({
    data: ids.map(job),
    pagination: {
      current_page,
      total_pages,
      total_count: 5,
      per_page: 2,
    },
  });
}

const client = () => createClient({ secretKey: "sk_test" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listJobs", () => {
  it("serializes filters as query params and skips undefined ones", async () => {
    const { calls } = stubFetch(() => pageResponse(["j1"], 1, 1));

    await client().listJobs({
      department: "Engineering",
      remote: true,
      per_page: 50,
      location: undefined,
    });

    const params = calls[0]!.url.searchParams;
    expect(params.get("department")).toBe("Engineering");
    expect(params.get("remote")).toBe("true");
    expect(params.get("per_page")).toBe("50");
    expect(params.has("location")).toBe(false);
    expect(params.has("page")).toBe(false);
  });

  it("returns wire data and pagination untouched (snake_case)", async () => {
    stubFetch(() => pageResponse(["j1", "j2"], 1, 3));

    const page = await client().listJobs();

    expect(page.data.map((j) => j.id)).toEqual(["j1", "j2"]);
    expect(page.pagination).toEqual({
      current_page: 1,
      total_pages: 3,
      total_count: 5,
      per_page: 2,
    });
    expect(page.data[0]!.employment_type).toBe("full_time");
  });

  it("exposes hasNextPage and a working nextPage()", async () => {
    const { calls } = stubFetch((call) => {
      const requestedPage = Number(call.url.searchParams.get("page") ?? "1");
      return requestedPage === 1
        ? pageResponse(["j1", "j2"], 1, 2)
        : pageResponse(["j3"], 2, 2);
    });

    const first = await client().listJobs({ department: "Engineering" });
    expect(first.hasNextPage).toBe(true);

    const nextPromise = first.nextPage();
    expect(nextPromise).not.toBeNull();
    const second = await nextPromise!;

    expect(second.data.map((j) => j.id)).toEqual(["j3"]);
    expect(second.hasNextPage).toBe(false);
    expect(second.nextPage()).toBeNull();

    // The next-page request keeps the original filters.
    expect(calls[1]!.url.searchParams.get("department")).toBe("Engineering");
    expect(calls[1]!.url.searchParams.get("page")).toBe("2");
  });
});

describe("allJobs", () => {
  it("iterates every job across all pages", async () => {
    const { calls } = stubFetch((call) => {
      const requestedPage = Number(call.url.searchParams.get("page") ?? "1");
      if (requestedPage === 1) return pageResponse(["j1", "j2"], 1, 3);
      if (requestedPage === 2) return pageResponse(["j3", "j4"], 2, 3);
      return pageResponse(["j5"], 3, 3);
    });

    const seen: string[] = [];
    for await (const item of client().allJobs({ remote: true })) {
      seen.push(item.id);
    }

    expect(seen).toEqual(["j1", "j2", "j3", "j4", "j5"]);
    expect(calls).toHaveLength(3);
    expect(calls[2]!.url.searchParams.get("remote")).toBe("true");
  });

  it("is lazy — fetches nothing until iterated", async () => {
    const { calls } = stubFetch(() => pageResponse(["j1"], 1, 1));

    const iterable = client().allJobs();
    expect(calls).toHaveLength(0);

    for await (const _job of iterable) {
      // drain
    }
    expect(calls).toHaveLength(1);
  });
});

describe("getJob", () => {
  it("fetches job detail by public token and URL-encodes it", async () => {
    const detail = {
      ...job("tok en"),
      description_html: "<p>Build things</p>",
      accepting_applications: true,
      stages: [
        {
          name: "Screening",
          type: "screening",
          compensation: { amount: 250.5, currency: "EUR" },
        },
      ],
      application_form: {
        fields: [
          { name: "email", type: "email", label: "Email", required: true },
        ],
        questions: [],
        consent_disclosure_html: "<p>GDPR</p>",
        resume: {
          required: true,
          content_types: ["application/pdf"],
          max_byte_size: 10485760,
        },
        turnstile: { required: false, sitekey: null },
      },
    };
    const { calls } = stubFetch(() => jsonResponse(detail));

    const result = await client().getJob("tok en");

    expect(calls[0]!.url.pathname).toBe("/api/public/v1/jobs/tok%20en");
    expect(result.description_html).toBe("<p>Build things</p>");
    expect(result.application_form.turnstile).toEqual({
      required: false,
      sitekey: null,
    });
    expect(result.application_form.resume).toEqual({
      required: true,
      content_types: ["application/pdf"],
      max_byte_size: 10485760,
    });
    expect(result.application_form.resume.required).toBe(true);
    expect(result.stages[0]?.compensation).toEqual({
      amount: 250.5,
      currency: "EUR",
    });
  });

  it("keeps resume.required false when the stage does not mandate a CV", async () => {
    const detail = {
      ...job("tok1"),
      description_html: "<p>Build things</p>",
      accepting_applications: true,
      stages: [],
      application_form: {
        fields: [],
        questions: [],
        consent_disclosure_html: "",
        resume: {
          required: false,
          content_types: ["application/pdf"],
          max_byte_size: 10485760,
        },
        turnstile: { required: false, sitekey: null },
      },
    };
    stubFetch(() => jsonResponse(detail));

    const result = await client().getJob("tok1");

    expect(result.application_form.resume.required).toBe(false);
  });
});
