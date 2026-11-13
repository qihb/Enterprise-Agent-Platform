import { DocumentError, errors, MAX_PDF_BYTES } from "./errors";

export function authorize(request: Request, write: boolean) {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  // Next.js can construct an internal localhost URL; browser origin is checked against the allowlisted Host.
  const origin = `http://${host}`;
  if (!["127.0.0.1:3000", "localhost:3000", "[::1]:3000"].includes(host)
    || request.headers.get("sec-fetch-site") === "cross-site"
    || (request.headers.has("origin") && request.headers.get("origin") !== origin)
    || (write && request.headers.get("origin") !== origin)) {
    throw new DocumentError("forbidden");
  }
}

export function uploadName(request: Request) {
  let name: string;
  try {
    name = decodeURIComponent(request.headers.get("x-file-name") ?? "").trim().normalize("NFC");
  } catch {
    throw new DocumentError("invalid_pdf");
  }
  if (!name || name.length > 200 || /[/\\\u0000-\u001f\u007f]/.test(name)
    || !/\.pdf$/i.test(name)
    || request.headers.get("content-type")?.split(";")[0].trim() !== "application/pdf") {
    throw new DocumentError("invalid_pdf");
  }
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_PDF_BYTES)) {
    throw new DocumentError("too_large");
  }
  return name;
}

export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

export function failure(error: unknown) {
  const code = error instanceof DocumentError ? error.code : "database_failed";
  return json({ error: { code, message: errors[code][1] } }, errors[code][0]);
}
