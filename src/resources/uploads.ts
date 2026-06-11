import type { Http } from "../client";
import type { UploadMeta, UploadTicket } from "../types";
import { KitNetworkError } from "../errors";
import { md5Base64 } from "../internal/md5";

export function createUpload(http: Http, meta: UploadMeta): Promise<UploadTicket> {
  return http.request<UploadTicket>("POST", "/api/public/v1/direct_uploads", {
    body: { blob: meta },
  });
}

export async function uploadFile(
  http: Http,
  file: Blob | File,
  meta: { filename?: string; content_type?: string } = {}
): Promise<{ signed_id: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checksum = md5Base64(bytes);

  const inferredName =
    typeof File !== "undefined" && file instanceof File ? file.name : undefined;
  const filename = meta.filename ?? inferredName ?? "upload";
  const content_type =
    meta.content_type ?? (file.type || "application/octet-stream");

  const ticket = await createUpload(http, {
    filename,
    byte_size: bytes.byteLength,
    checksum,
    content_type,
  });

  let response: Response;
  try {
    response = await fetch(ticket.direct_upload.url, {
      method: "PUT",
      headers: ticket.direct_upload.headers,
      body: file,
    });
  } catch (cause) {
    throw new KitNetworkError(
      `Direct upload PUT to ${ticket.direct_upload.url} failed`,
      { cause }
    );
  }

  if (!response.ok) {
    throw new KitNetworkError(
      `Direct upload PUT failed with status ${response.status}`
    );
  }

  return { signed_id: ticket.signed_id };
}
