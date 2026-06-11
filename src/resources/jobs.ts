import type { Http } from "../client";
import type { Job, JobDetail, ListJobsParams, Page, Pagination } from "../types";

interface RawJobsPage {
  data: Job[];
  pagination: Pagination;
}

function buildPage<T>(
  raw: { data: T[]; pagination: Pagination },
  fetchPage: (page: number) => Promise<Page<T>>
): Page<T> {
  const { current_page, total_pages } = raw.pagination;
  const hasNextPage = current_page < total_pages;

  return {
    data: raw.data,
    pagination: raw.pagination,
    hasNextPage,
    nextPage: () => (hasNextPage ? fetchPage(current_page + 1) : null),
  };
}

export async function listJobs(
  http: Http,
  params: ListJobsParams = {}
): Promise<Page<Job>> {
  const raw = await http.request<RawJobsPage>("GET", "/api/public/v1/jobs", {
    query: { ...params },
  });
  return buildPage(raw, (page) => listJobs(http, { ...params, page }));
}

export async function* allJobs(
  http: Http,
  params: ListJobsParams = {}
): AsyncGenerator<Job, void, undefined> {
  let page: Page<Job> | null = await listJobs(http, params);
  while (page) {
    yield* page.data;
    const next = page.nextPage();
    page = next ? await next : null;
  }
}

export function getJob(http: Http, publicToken: string): Promise<JobDetail> {
  return http.request<JobDetail>(
    "GET",
    `/api/public/v1/jobs/${encodeURIComponent(publicToken)}`
  );
}
