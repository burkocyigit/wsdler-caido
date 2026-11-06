export const NS = {
  XSD: "http://www.w3.org/2001/XMLSchema",
  XSI: "http://www.w3.org/2001/XMLSchema-instance",
  XML: "http://www.w3.org/XML/1998/namespace",
  WSDL: "http://schemas.xmlsoap.org/wsdl/",
  WSDL_SOAP11: "http://schemas.xmlsoap.org/wsdl/soap/",
  WSDL_SOAP12: "http://schemas.xmlsoap.org/wsdl/soap12/",
  WSDL_MIME: "http://schemas.xmlsoap.org/wsdl/mime/",
  ENV11: "http://schemas.xmlsoap.org/soap/envelope/",
  ENV12: "http://www.w3.org/2003/05/soap-envelope",
  ENC11: "http://schemas.xmlsoap.org/soap/encoding/",
  ENC12: "http://www.w3.org/2003/05/soap-encoding",
  XMIME: "http://www.w3.org/2005/05/xmlmime",
  SWAREF: "http://ws-i.org/profiles/basic/1.1/xsd",
} as const;

const LEGACY_XSD = new Set([
  NS.XSD,
  "http://www.w3.org/2000/10/XMLSchema",
  "http://www.w3.org/1999/XMLSchema",
]);

export const isXsdNamespace = (ns: string) => LEGACY_XSD.has(ns);

export type QName = { ns: string; local: string };

export const qkey = (q: QName) => `{${q.ns}}${q.local}`;

export const qeq = (a: QName | undefined, b: QName | undefined) =>
  a !== undefined && b !== undefined && a.ns === b.ns && a.local === b.local;

const ELEMENT_NODE = 1;

export function childElements(
  el: Element,
  ns?: string | readonly string[],
  local?: string,
): Element[] {
  const result: Element[] = [];
  const nsList =
    ns === undefined ? undefined : typeof ns === "string" ? [ns] : ns;
  for (let n = el.firstChild; n !== null; n = n.nextSibling) {
    if (n.nodeType !== ELEMENT_NODE) {
      continue;
    }
    const e = n as Element;
    if (nsList !== undefined && !nsList.includes(e.namespaceURI ?? "")) {
      continue;
    }
    if (local !== undefined && e.localName !== local) {
      continue;
    }
    result.push(e);
  }
  return result;
}

export function firstChild(
  el: Element,
  ns?: string | readonly string[],
  local?: string,
): Element | undefined {
  return childElements(el, ns, local)[0];
}

export function xsdChildren(el: Element, local?: string): Element[] {
  return childElements(el, [...LEGACY_XSD], local);
}

export function xsdChild(el: Element, local?: string): Element | undefined {
  return xsdChildren(el, local)[0];
}

export function attr(el: Element, name: string): string | undefined {
  return el.hasAttribute(name)
    ? (el.getAttribute(name) ?? undefined)
    : undefined;
}

export function resolveQName(el: Element, value: string): QName {
  const trimmed = value.trim();
  const idx = trimmed.indexOf(":");
  if (idx < 0) {
    return { ns: el.lookupNamespaceURI(null) ?? "", local: trimmed };
  }
  const prefix = trimmed.substring(0, idx);
  const local = trimmed.substring(idx + 1);
  if (prefix === "xml") {
    return { ns: NS.XML, local };
  }
  return { ns: el.lookupNamespaceURI(prefix) ?? "", local };
}

export function parseXml(text: string, url: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const errors = doc.getElementsByTagName("parsererror");
  if (errors.length > 0 || doc.documentElement === null) {
    const detail = errors[0]?.textContent ?? "unknown error";
    throw new Error(`Failed to parse XML from ${url}: ${detail.trim()}`);
  }
  return doc;
}
