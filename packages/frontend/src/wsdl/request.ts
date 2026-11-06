type Target = { host: string; port: number; isTls: boolean };

export function endpointParts(
  endpoint: string,
): { hostHeader: string; path: string; target: Target } | undefined {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return undefined;
  }
  const isTls = url.protocol === "https:";
  const port = url.port !== "" ? parseInt(url.port, 10) : isTls ? 443 : 80;
  return {
    hostHeader: url.host,
    path: `${url.pathname === "" ? "/" : url.pathname}${url.search}`,
    target: { host: url.hostname.replace(/^\[|\]$/g, ""), port, isTls },
  };
}

function headerLines(rawRequest: string): string[] {
  const normalized = rawRequest.replace(/\r\n/g, "\n");
  const end = normalized.indexOf("\n\n");
  const head = end >= 0 ? normalized.substring(0, end) : normalized;
  return head.split("\n").filter((l) => l !== "");
}

const DROPPED_HEADERS = [
  "host",
  "content-type",
  "content-length",
  "transfer-encoding",
];

export function buildSoapRequest(
  originalRequest: string,
  endpoint: string,
  soapAction: string,
  envelope: string,
): string {
  const parts = endpointParts(endpoint);
  const hostHeader = parts?.hostHeader ?? "";
  const path = parts?.path ?? "/";
  const lines = headerLines(originalRequest);
  lines.shift();
  const kept = lines.filter((line) => {
    const name = line.substring(0, line.indexOf(":")).trim().toLowerCase();
    return !DROPPED_HEADERS.includes(name);
  });
  const bodyLength = new TextEncoder().encode(envelope).length;
  const headers = [
    `POST ${path} HTTP/1.1`,
    ...kept,
    `SOAPAction: ${soapAction}`,
    "Content-Type: text/xml;charset=UTF-8",
    `Host: ${hostHeader}`,
    `Content-Length: ${bodyLength}`,
  ];
  return `${headers.join("\r\n")}\r\n\r\n${envelope}`;
}

export function requestName(url: string): string {
  let name = url.substring(url.lastIndexOf("/") + 1);
  if (name.includes(".")) {
    name = name.substring(0, name.indexOf("."));
  }
  if (name.includes("?")) {
    name = name.substring(0, name.indexOf("?"));
  }
  return name === "" ? "wsdl" : name;
}
