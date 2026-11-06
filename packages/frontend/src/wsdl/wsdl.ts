import { element, SampleGenerator, type XElement } from "./sample";
import { SchemaSet } from "./schema";
import { PrefixMap, serialize } from "./serialize";
import {
  attr,
  childElements,
  firstChild,
  isXsdNamespace,
  NS,
  parseXml,
  qkey,
  type QName,
  resolveQName,
  xsdChildren,
} from "./xml";

export type Fetcher = (url: string) => Promise<string>;

type Part = {
  name: string;
  element: QName | undefined;
  type: QName | undefined;
};
type Message = { name: QName; parts: Part[] };
type PortTypeOperation = { name: string; input: QName | undefined };
type SoapHeaderRef = { message: QName; part: string };
type BindingOperation = {
  name: string;
  soapAction: string;
  style: string | undefined;
  inputUse: string | undefined;
  inputNamespace: string | undefined;
  inputParts: string[] | undefined;
  headers: SoapHeaderRef[];
  attachmentParts: string[];
};
type SoapVersion = "1.1" | "1.2";
type Binding = {
  name: QName;
  portType: QName;
  soapVersion: SoapVersion | undefined;
  style: string | undefined;
  operations: BindingOperation[];
};

type WsdlOperation = {
  bindingName: string;
  operationName: string;
  soapAction: string;
  soapVersion: SoapVersion;
  endpoints: string[];
  envelope: string;
};

type WsdlWarning = { url: string; message: string };

const SOAP_BINDING_NS = [NS.WSDL_SOAP11, NS.WSDL_SOAP12];

export class WsdlDefinition {
  readonly schemas = new SchemaSet();
  readonly warnings: WsdlWarning[] = [];
  private readonly messages = new Map<string, Message>();
  private readonly portTypes = new Map<string, PortTypeOperation[]>();
  private readonly bindings: Binding[] = [];
  private readonly ports: Array<{ binding: QName; location: string }> = [];
  private readonly loaded = new Set<string>();
  private targetNamespace = "";

  private constructor(private readonly fetcher: Fetcher) {}

  static async load(
    url: string,
    text: string,
    fetcher: Fetcher,
  ): Promise<WsdlDefinition> {
    const def = new WsdlDefinition(fetcher);
    const doc = parseXml(text, url);
    def.loaded.add(url);
    const root = doc.documentElement;
    if (root.namespaceURI !== NS.WSDL || root.localName !== "definitions") {
      throw new Error(
        `The response is not a WSDL 1.1 document (root element is <${root.localName}> in namespace "${root.namespaceURI ?? ""}")`,
      );
    }
    def.targetNamespace = attr(root, "targetNamespace") ?? "";
    await def.processDefinitions(root, url);
    return def;
  }

  private async fetchDocument(
    location: string,
    base: string,
  ): Promise<{ url: string; root: Element } | undefined> {
    let url: string;
    try {
      url = new URL(location, base).toString();
    } catch {
      url = location;
    }
    if (this.loaded.has(url)) {
      return undefined;
    }
    this.loaded.add(url);
    try {
      const text = await this.fetcher(url);
      return { url, root: parseXml(text, url).documentElement };
    } catch (e) {
      this.warnings.push({
        url,
        message: e instanceof Error ? e.message : String(e),
      });
      return undefined;
    }
  }

  private async processDefinitions(root: Element, url: string) {
    for (const imp of childElements(root, NS.WSDL, "import")) {
      const location = attr(imp, "location");
      if (location === undefined) {
        continue;
      }
      const fetched = await this.fetchDocument(location, url);
      if (fetched === undefined) {
        continue;
      }
      if (
        fetched.root.namespaceURI === NS.WSDL &&
        fetched.root.localName === "definitions"
      ) {
        await this.processDefinitions(fetched.root, fetched.url);
      } else if (
        isXsdNamespace(fetched.root.namespaceURI ?? "") &&
        fetched.root.localName === "schema"
      ) {
        await this.processSchema(fetched.root, fetched.url, undefined);
      }
    }

    for (const types of childElements(root, NS.WSDL, "types")) {
      for (const schema of xsdChildren(types, "schema")) {
        await this.processSchema(schema, url, undefined);
      }
    }

    const tns = attr(root, "targetNamespace") ?? "";
    for (const msg of childElements(root, NS.WSDL, "message")) {
      const name: QName = { ns: tns, local: attr(msg, "name") ?? "" };
      const parts = childElements(msg, NS.WSDL, "part").map((p) => {
        const elementAttr = attr(p, "element");
        const typeAttr = attr(p, "type");
        return {
          name: attr(p, "name") ?? "",
          element:
            elementAttr === undefined
              ? undefined
              : resolveQName(p, elementAttr),
          type: typeAttr === undefined ? undefined : resolveQName(p, typeAttr),
        };
      });
      this.messages.set(qkey(name), { name, parts });
    }

    for (const pt of childElements(root, NS.WSDL, "portType")) {
      const name: QName = { ns: tns, local: attr(pt, "name") ?? "" };
      const ops = childElements(pt, NS.WSDL, "operation").map((op) => {
        const input = firstChild(op, NS.WSDL, "input");
        const message =
          input === undefined ? undefined : attr(input, "message");
        return {
          name: attr(op, "name") ?? "",
          input:
            input === undefined || message === undefined
              ? undefined
              : resolveQName(input, message),
        };
      });
      this.portTypes.set(qkey(name), ops);
    }

    for (const b of childElements(root, NS.WSDL, "binding")) {
      this.bindings.push(this.parseBinding(b, tns));
    }

    for (const service of childElements(root, NS.WSDL, "service")) {
      for (const port of childElements(service, NS.WSDL, "port")) {
        const bindingAttr = attr(port, "binding");
        const address = firstChild(port, SOAP_BINDING_NS, "address");
        const location =
          address === undefined ? undefined : attr(address, "location");
        if (bindingAttr !== undefined && location !== undefined) {
          this.ports.push({
            binding: resolveQName(port, bindingAttr),
            location,
          });
        }
      }
    }
  }

  private async processSchema(
    schema: Element,
    url: string,
    tnsOverride: string | undefined,
  ) {
    this.schemas.addSchema(schema, tnsOverride);
    const tns = attr(schema, "targetNamespace") ?? tnsOverride;
    for (const ref of xsdChildren(schema)) {
      if (
        ref.localName !== "import" &&
        ref.localName !== "include" &&
        ref.localName !== "redefine"
      ) {
        continue;
      }
      const location = attr(ref, "schemaLocation");
      if (location === undefined) {
        continue;
      }
      const fetched = await this.fetchDocument(location, url);
      if (
        fetched === undefined ||
        !isXsdNamespace(fetched.root.namespaceURI ?? "") ||
        fetched.root.localName !== "schema"
      ) {
        continue;
      }
      await this.processSchema(
        fetched.root,
        fetched.url,
        ref.localName === "import" ? undefined : tns,
      );
    }
  }

  private parseBinding(b: Element, tns: string): Binding {
    const soap11 = firstChild(b, NS.WSDL_SOAP11, "binding");
    const soap12 = firstChild(b, NS.WSDL_SOAP12, "binding");
    const soapBinding = soap11 ?? soap12;
    const typeAttr = attr(b, "type") ?? "";
    return {
      name: { ns: tns, local: attr(b, "name") ?? "" },
      portType: resolveQName(b, typeAttr),
      soapVersion:
        soap11 !== undefined ? "1.1" : soap12 !== undefined ? "1.2" : undefined,
      style: soapBinding === undefined ? undefined : attr(soapBinding, "style"),
      operations: childElements(b, NS.WSDL, "operation").map((op) => {
        const soapOp = firstChild(op, SOAP_BINDING_NS, "operation");
        const input = firstChild(op, NS.WSDL, "input");
        let body: Element | undefined;
        const headers: SoapHeaderRef[] = [];
        const attachmentParts: string[] = [];
        if (input !== undefined) {
          body = firstChild(input, SOAP_BINDING_NS, "body");
          const multipart = firstChild(input, NS.WSDL_MIME, "multipartRelated");
          const headerContainers = [input];
          if (multipart !== undefined) {
            for (const mimePart of childElements(
              multipart,
              NS.WSDL_MIME,
              "part",
            )) {
              body ??= firstChild(mimePart, SOAP_BINDING_NS, "body");
              headerContainers.push(mimePart);
              for (const content of childElements(
                mimePart,
                NS.WSDL_MIME,
                "content",
              )) {
                const part = attr(content, "part");
                if (part !== undefined) {
                  attachmentParts.push(part);
                }
              }
            }
          }
          for (const container of headerContainers) {
            for (const header of childElements(
              container,
              SOAP_BINDING_NS,
              "header",
            )) {
              const message = attr(header, "message");
              const part = attr(header, "part");
              if (message !== undefined && part !== undefined) {
                headers.push({ message: resolveQName(header, message), part });
              }
            }
          }
        }
        const partsAttr = body === undefined ? undefined : attr(body, "parts");
        return {
          name: attr(op, "name") ?? "",
          soapAction:
            soapOp === undefined ? "" : (attr(soapOp, "soapAction") ?? ""),
          style: soapOp === undefined ? undefined : attr(soapOp, "style"),
          inputUse: body === undefined ? undefined : attr(body, "use"),
          inputNamespace:
            body === undefined ? undefined : attr(body, "namespace"),
          inputParts:
            partsAttr === undefined
              ? undefined
              : partsAttr.split(/\s+/).filter((s) => s !== ""),
          headers,
          attachmentParts,
        };
      }),
    };
  }

  serviceUrls(binding: QName): string[] {
    return this.ports
      .filter(
        (p) => p.binding.local === binding.local && p.binding.ns === binding.ns,
      )
      .map((p) => p.location);
  }

  operations(): { operations: WsdlOperation[]; failures: string[] } {
    const operations: WsdlOperation[] = [];
    const failures: string[] = [];
    for (const binding of this.bindings) {
      if (binding.soapVersion === undefined) {
        continue;
      }
      for (const op of binding.operations) {
        try {
          operations.push({
            bindingName: binding.name.local,
            operationName: op.name,
            soapAction: op.soapAction,
            soapVersion: binding.soapVersion,
            endpoints: this.serviceUrls(binding.name),
            envelope: this.buildInputMessage(binding, op),
          });
        } catch (e) {
          failures.push(
            `${binding.name.local}.${op.name}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
    return { operations, failures };
  }

  private inputParts(binding: Binding, op: BindingOperation): Part[] {
    const portOps = this.portTypes.get(qkey(binding.portType)) ?? [];
    const portOp = portOps.find((p) => p.name === op.name);
    if (portOp === undefined) {
      throw new Error(
        `Operation ${op.name} not found in portType ${binding.portType.local}`,
      );
    }
    if (portOp.input === undefined) {
      return [];
    }
    const message = this.messages.get(qkey(portOp.input));
    if (message === undefined) {
      throw new Error(`Message ${portOp.input.local} not found`);
    }
    if (op.inputParts !== undefined) {
      const names = op.inputParts;
      return names
        .map((n) => message.parts.find((p) => p.name === n))
        .filter((p): p is Part => p !== undefined);
    }
    const headerParts = op.headers
      .filter((h) => qkey(h.message) === qkey(message.name))
      .map((h) => h.part);
    return message.parts.filter((p) => !headerParts.includes(p.name));
  }

  private buildInputMessage(binding: Binding, op: BindingOperation): string {
    const soapVersion = binding.soapVersion ?? "1.1";
    const envNs = soapVersion === "1.1" ? NS.ENV11 : NS.ENV12;
    const encNs = soapVersion === "1.1" ? NS.ENC11 : NS.ENC12;
    const soapEnc = op.inputUse === "encoded";
    const generator = new SampleGenerator(this.schemas, {
      soapEnc,
      typeComments: true,
      skipComments: false,
      ignoreOptional: false,
    });

    const prefixes = new PrefixMap();
    prefixes.declare(envNs, soapVersion === "1.1" ? "soapenv" : "soap");
    if (soapEnc) {
      prefixes.declare(NS.XSI, "xsi");
      prefixes.declare(NS.XSD, "xsd");
    }

    const envelope = element({ ns: envNs, local: "Envelope" });
    const header = element({ ns: envNs, local: "Header" });
    const body = element({ ns: envNs, local: "Body" });
    envelope.children.push(header, body);

    const parts = this.inputParts(binding, op);
    const isRpc =
      (op.style ?? binding.style ?? "document").toLowerCase() === "rpc";
    if (isRpc) {
      const ns = op.inputNamespace ?? this.targetNamespace;
      const wrapper = element({ ns, local: op.name });
      if (soapEnc) {
        wrapper.attrs.push({
          name: { ns: envNs, local: "encodingStyle" },
          value: encNs,
        });
      }
      body.children.push(wrapper);
      for (const part of parts) {
        if (op.attachmentParts.includes(part.name)) {
          const attachment = element({ ns: "", local: part.name });
          attachment.attrs.push({
            name: { ns: "", local: "href" },
            value: `${part.name}Attachment`,
          });
          wrapper.children.push(attachment);
        } else if (part.type !== undefined) {
          const partEl = element({ ns: "", local: part.name });
          wrapper.children.push(partEl);
          generator.createSampleForType(
            this.schemas.findType(part.type),
            partEl,
          );
        } else if (part.element !== undefined) {
          const decl = this.schemas.findElement(part.element);
          if (decl !== undefined) {
            const partEl = element(decl.name);
            wrapper.children.push(partEl);
            generator.createSampleForType(decl.type, partEl);
          }
        }
      }
    } else {
      for (const part of parts) {
        if (op.attachmentParts.includes(part.name)) {
          continue;
        }
        this.createElementForPart(part, body, generator);
      }
    }

    for (const h of op.headers) {
      const message = this.messages.get(qkey(h.message));
      const part = message?.parts.find((p) => p.name === h.part);
      if (part !== undefined) {
        this.createElementForPart(part, header, generator);
      }
    }

    return serialize(envelope, prefixes);
  }

  private createElementForPart(
    part: Part,
    target: XElement,
    generator: SampleGenerator,
  ) {
    if (part.element !== undefined) {
      const el = element(part.element);
      target.children.push(el);
      const decl = this.schemas.findElement(part.element);
      if (decl === undefined) {
        throw new Error(
          `Could not find element ${part.element.local} specified in part ${part.name}`,
        );
      }
      generator.createSampleForType(decl.type, el);
    } else if (part.type !== undefined) {
      const el = element({ ns: "", local: part.name });
      target.children.push(el);
      generator.createSampleForType(this.schemas.findType(part.type), el);
    }
  }
}
