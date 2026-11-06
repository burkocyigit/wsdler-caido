import { RequestSpecRaw } from "caido:utils";
import type { HttpTarget } from "shared";

import type { BackendSDK } from "../types";

const DROPPED_HEADERS = [
  "host",
  "content-length",
  "content-type",
  "transfer-encoding",
  "accept-encoding",
];
const MAX_REDIRECTS = 5;

function headerLines(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, "\n");
  const end = normalized.indexOf("\n\n");
  const head = end >= 0 ? normalized.substring(0, end) : normalized;
  return head.split("\n").filter((line) => line !== "");
}

function buildGetRequest(baseRequest: string, url: URL): string {
  const lines = headerLines(baseRequest)
    .slice(1)
    .filter((line) => {
      const name = line.substring(0, line.indexOf(":")).trim().toLowerCase();
      return !DROPPED_HEADERS.includes(name);
    });
  const path = `${url.pathname === "" ? "/" : url.pathname}${url.search}`;
  return [`GET ${path} HTTP/1.1`, `Host: ${url.host}`, ...lines, "", ""].join(
    "\r\n",
  );
}

export function targetUrl(target: HttpTarget, raw: string): string {
  const requestLine = headerLines(raw)[0] ?? "";
  const path = requestLine.split(" ")[1] ?? "/";
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const scheme = target.isTls ? "https" : "http";
  const defaultPort = target.isTls ? 443 : 80;
  const host = target.host.includes(":") ? `[${target.host}]` : target.host;
  const port = target.port === defaultPort ? "" : `:${target.port}`;
  return `${scheme}://${host}${port}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function fetchText(
  sdk: BackendSDK,
  baseRequest: string,
  url: string,
): Promise<string> {
  let current = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const spec = new RequestSpecRaw(current.toString());
    spec.setRaw(buildGetRequest(baseRequest, current));
    const { response } = await sdk.requests.send(spec);
    const code = response.getCode();
    const location = response.getHeader("Location")?.[0];
    if (code >= 300 && code < 400 && location !== undefined) {
      current = new URL(location, current);
      continue;
    }
    const body = response.getBody()?.toText() ?? "";
    if (code >= 400) {
      throw new Error(`HTTP ${code} while fetching ${current.toString()}`);
    }
    return body;
  }
  throw new Error(`Too many redirects while fetching ${url}`);
}
