import type { XElement, XNode } from "./sample";
import { NS } from "./xml";

const WELL_KNOWN_PREFIXES: Record<string, string> = {
  [NS.XML]: "xml",
  [NS.XSD]: "xs",
  [NS.XSI]: "xsi",
  [NS.WSDL]: "wsdl",
  [NS.ENC11]: "soapenc",
  [NS.ENV11]: "soapenv",
};

const isVowel = (c: string | undefined) =>
  c !== undefined && "aeiouAEIOU".includes(c);
const isNameStart = (c: string) => /[A-Za-z_]/.test(c);
const isLetterOrDigit = (c: string) => /[A-Za-z0-9]/.test(c);

function suggestPrefix(namespace: string): string {
  const known = WELL_KNOWN_PREFIXES[namespace];
  if (known !== undefined) {
    return known;
  }
  let len = namespace.length;
  let i = namespace.lastIndexOf("/");
  if (i > 0 && i === namespace.length - 1) {
    len = i;
    i = namespace.lastIndexOf("/", i - 1);
  }
  i += 1;
  if (namespace.startsWith("www.", i)) {
    i += 4;
  }
  while (i < len) {
    if (isNameStart(namespace.charAt(i))) {
      break;
    }
    i += 1;
  }
  for (let end = i + 1; end < len; end += 1) {
    if (!isLetterOrDigit(namespace.charAt(end))) {
      len = end;
      break;
    }
  }
  if (len - i >= 3 && namespace.substring(i, i + 3).toLowerCase() === "xml") {
    if (len - i >= 4) {
      return "x" + namespace.charAt(i + 3).toLowerCase();
    }
    return "ns";
  }
  if (len - i > 4) {
    if (isVowel(namespace.charAt(i + 2)) && !isVowel(namespace.charAt(i + 3))) {
      len = i + 4;
    } else {
      len = i + 3;
    }
  }
  if (len - i <= 0) {
    return "ns";
  }
  return namespace.substring(i, len).toLowerCase();
}

export class PrefixMap {
  private readonly byNs = new Map<string, string>();
  private readonly used = new Set<string>(["xml"]);

  declare(ns: string, prefix: string) {
    if (this.byNs.has(ns)) {
      return;
    }
    this.byNs.set(ns, prefix);
    this.used.add(prefix);
  }

  prefixFor(ns: string): string {
    if (ns === NS.XML) {
      return "xml";
    }
    const existing = this.byNs.get(ns);
    if (existing !== undefined) {
      return existing;
    }
    const base = suggestPrefix(ns);
    let candidate = base;
    for (let n = 1; this.used.has(candidate); n++) {
      candidate = base + n;
    }
    this.declare(ns, candidate);
    return candidate;
  }

  entries(): Array<[string, string]> {
    return [...this.byNs.entries()];
  }
}

const escapeText = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, "&quot;");

function collectPrefixes(node: XElement, prefixes: PrefixMap) {
  if (node.name.ns !== "") {
    prefixes.prefixFor(node.name.ns);
  }
  for (const a of node.attrs) {
    if (a.name.ns !== "") {
      prefixes.prefixFor(a.name.ns);
    }
    if (a.qnameValue !== undefined && a.qnameValue.name.ns !== "") {
      prefixes.prefixFor(a.qnameValue.name.ns);
    }
  }
  for (const c of node.children) {
    if (c.kind === "element") {
      collectPrefixes(c, prefixes);
    }
  }
}

export function serialize(
  root: XElement,
  prefixes: PrefixMap,
  indent = "   ",
): string {
  collectPrefixes(root, prefixes);
  const qname = (ns: string, local: string) =>
    ns === "" ? local : `${prefixes.prefixFor(ns)}:${local}`;
  const lines: string[] = [];

  const writeElement = (el: XElement, depth: number, isRoot: boolean) => {
    const pad = indent.repeat(depth);
    const attrs: string[] = [];
    if (isRoot) {
      for (const [ns, prefix] of prefixes.entries()) {
        if (prefix !== "xml") {
          attrs.push(`xmlns:${prefix}="${escapeAttr(ns)}"`);
        }
      }
    }
    for (const a of el.attrs) {
      const value =
        a.qnameValue !== undefined
          ? qname(a.qnameValue.name.ns, a.qnameValue.name.local) +
            a.qnameValue.suffix
          : a.value;
      attrs.push(`${qname(a.name.ns, a.name.local)}="${escapeAttr(value)}"`);
    }
    const tag = qname(el.name.ns, el.name.local);
    const open = attrs.length > 0 ? `${tag} ${attrs.join(" ")}` : tag;
    if (el.children.length === 0) {
      lines.push(`${pad}<${open}/>`);
      return;
    }
    if (el.children.every((c) => c.kind === "text")) {
      const text = el.children
        .map((c) => (c as { text: string }).text)
        .join("");
      lines.push(`${pad}<${open}>${escapeText(text)}</${tag}>`);
      return;
    }
    lines.push(`${pad}<${open}>`);
    for (const c of el.children) {
      writeNode(c, depth + 1);
    }
    lines.push(`${pad}</${tag}>`);
  };

  const writeNode = (node: XNode, depth: number) => {
    const pad = indent.repeat(depth);
    switch (node.kind) {
      case "element":
        writeElement(node, depth, false);
        break;
      case "comment":
        lines.push(`${pad}<!--${node.text}-->`);
        break;
      case "text":
        if (node.text.trim() !== "") {
          lines.push(`${pad}${escapeText(node.text.trim())}`);
        }
        break;
    }
  };

  writeElement(root, 0, true);
  return lines.join("\n");
}
