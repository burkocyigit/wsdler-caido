import {
  attr,
  isXsdNamespace,
  NS,
  qkey,
  type QName,
  resolveQName,
  xsdChild,
  xsdChildren,
} from "./xml";

type SchemaContext = {
  tns: string;
  elementQualified: boolean;
  attributeQualified: boolean;
};

type Decl = { el: Element; ctx: SchemaContext };

export type TypeRef =
  | { kind: "builtin"; name: QName }
  | { kind: "simple"; el: Element; ctx: SchemaContext; name: QName | undefined }
  | {
      kind: "complex";
      el: Element;
      ctx: SchemaContext;
      name: QName | undefined;
    }
  | { kind: "unresolved"; name: QName };

type ElementDecl = {
  name: QName;
  type: TypeRef;
  defaultValue: string | undefined;
};

type Occurs = { min: number; max: number | "unbounded" };

export type Particle =
  | ({ kind: "element"; decl: () => ElementDecl } & Occurs)
  | ({ kind: "sequence" | "choice" | "all"; children: Particle[] } & Occurs)
  | ({ kind: "any" } & Occurs);

type AttributeUse = {
  name: QName;
  type: TypeRef;
  defaultValue: string | undefined;
  required: boolean;
  prohibited: boolean;
  wsdlArrayType: QNameWithSuffix | undefined;
};

type QNameWithSuffix = { name: QName; suffix: string };

type ComplexInfo = {
  content: "empty" | "simple" | "element" | "mixed";
  particle: Particle | undefined;
  attributes: AttributeUse[];
  simple: TypeRef | undefined;
};

type SimpleFacets = {
  length?: number;
  minLength?: number;
  maxLength?: number;
  minInclusive?: string;
  maxInclusive?: string;
  minExclusive?: string;
  maxExclusive?: string;
  totalDigits?: number;
  fractionDigits?: number;
};

export type SimpleInfo = {
  variety: "atomic" | "list" | "union" | "anyType" | "anySimpleType";
  builtin: string;
  name: QName | undefined;
  enumerations: string[];
  facets: SimpleFacets;
  itemType: TypeRef | undefined;
  memberTypes: TypeRef[];
};

const PRIMITIVES: Record<string, string> = {
  string: "string",
  normalizedString: "string",
  token: "string",
  language: "string",
  Name: "string",
  NCName: "string",
  ID: "string",
  IDREF: "string",
  ENTITY: "string",
  NMTOKEN: "string",
  boolean: "boolean",
  decimal: "decimal",
  integer: "decimal",
  nonPositiveInteger: "decimal",
  negativeInteger: "decimal",
  long: "decimal",
  int: "decimal",
  short: "decimal",
  byte: "decimal",
  nonNegativeInteger: "decimal",
  unsignedLong: "decimal",
  unsignedInt: "decimal",
  unsignedShort: "decimal",
  unsignedByte: "decimal",
  positiveInteger: "decimal",
  float: "float",
  double: "double",
  duration: "duration",
  dateTime: "dateTime",
  time: "time",
  date: "date",
  gYearMonth: "gYearMonth",
  gYear: "gYear",
  gMonthDay: "gMonthDay",
  gDay: "gDay",
  gMonth: "gMonth",
  hexBinary: "hexBinary",
  base64Binary: "base64Binary",
  anyURI: "anyURI",
  QName: "QName",
  NOTATION: "NOTATION",
};

const BUILTIN_LISTS: Record<string, string> = {
  NMTOKENS: "NMTOKEN",
  IDREFS: "IDREF",
  ENTITIES: "ENTITY",
};

export const primitiveOf = (builtin: string) => PRIMITIVES[builtin] ?? "string";

const isKnownBuiltin = (local: string) =>
  local in PRIMITIVES ||
  local in BUILTIN_LISTS ||
  local === "anyType" ||
  local === "anySimpleType";

const parseOccurs = (el: Element): Occurs => {
  const min = attr(el, "minOccurs");
  const max = attr(el, "maxOccurs");
  return {
    min: min === undefined ? 1 : parseInt(min, 10),
    max:
      max === undefined
        ? 1
        : max === "unbounded"
          ? "unbounded"
          : parseInt(max, 10),
  };
};

const ANY_TYPE: TypeRef = {
  kind: "builtin",
  name: { ns: NS.XSD, local: "anyType" },
};
const ANY_SIMPLE: TypeRef = {
  kind: "builtin",
  name: { ns: NS.XSD, local: "anySimpleType" },
};

export class SchemaSet {
  private readonly elements = new Map<string, Decl>();
  private readonly types = new Map<string, Decl>();
  private readonly groups = new Map<string, Decl>();
  private readonly attributeGroups = new Map<string, Decl>();
  private readonly attributes = new Map<string, Decl>();
  private readonly complexCache = new Map<Element, ComplexInfo>();
  private readonly simpleCache = new Map<Element, SimpleInfo>();
  private schemaCount = 0;

  get size() {
    return this.schemaCount;
  }

  addSchema(schema: Element, tnsOverride?: string) {
    this.schemaCount++;
    const ctx: SchemaContext = {
      tns: attr(schema, "targetNamespace") ?? tnsOverride ?? "",
      elementQualified: attr(schema, "elementFormDefault") === "qualified",
      attributeQualified: attr(schema, "attributeFormDefault") === "qualified",
    };
    const register = (map: Map<string, Decl>, el: Element) => {
      const name = attr(el, "name");
      if (name === undefined) {
        return;
      }
      const key = qkey({ ns: ctx.tns, local: name });
      if (!map.has(key)) {
        map.set(key, { el, ctx });
      }
    };
    const containers = [schema, ...xsdChildren(schema, "redefine")];
    for (const container of containers) {
      for (const child of xsdChildren(container)) {
        switch (child.localName) {
          case "element":
            register(this.elements, child);
            break;
          case "complexType":
          case "simpleType":
            register(this.types, child);
            break;
          case "group":
            register(this.groups, child);
            break;
          case "attributeGroup":
            register(this.attributeGroups, child);
            break;
          case "attribute":
            register(this.attributes, child);
            break;
        }
      }
    }
  }

  hasElement(name: QName) {
    return this.elements.has(qkey(name));
  }

  findElement(name: QName): ElementDecl | undefined {
    const decl = this.elements.get(qkey(name));
    if (decl === undefined) {
      return undefined;
    }
    return this.elementDecl(decl.el, decl.ctx, true);
  }

  findType(name: QName): TypeRef {
    if (isXsdNamespace(name.ns)) {
      return { kind: "builtin", name: { ns: NS.XSD, local: name.local } };
    }
    const decl = this.types.get(qkey(name));
    if (decl !== undefined) {
      return decl.el.localName === "complexType"
        ? { kind: "complex", el: decl.el, ctx: decl.ctx, name }
        : { kind: "simple", el: decl.el, ctx: decl.ctx, name };
    }
    if (
      (name.ns === NS.ENC11 || name.ns === NS.ENC12) &&
      isKnownBuiltin(name.local)
    ) {
      return { kind: "builtin", name: { ns: NS.XSD, local: name.local } };
    }
    if (
      (name.ns === NS.ENC11 || name.ns === NS.ENC12) &&
      (name.local === "Array" || name.local === "Struct")
    ) {
      return ANY_TYPE;
    }
    if (name.ns === "" && isKnownBuiltin(name.local)) {
      return { kind: "builtin", name: { ns: NS.XSD, local: name.local } };
    }
    return { kind: "unresolved", name };
  }

  private typeFromAttribute(el: Element, value: string): TypeRef {
    return this.findType(resolveQName(el, value));
  }

  private elementDecl(
    el: Element,
    ctx: SchemaContext,
    global: boolean,
  ): ElementDecl {
    const ref = attr(el, "ref");
    if (ref !== undefined) {
      const refName = resolveQName(el, ref);
      const target = this.findElement(refName);
      if (target !== undefined) {
        return target;
      }
      return {
        name: refName,
        type: { kind: "unresolved", name: refName },
        defaultValue: undefined,
      };
    }
    const local = attr(el, "name") ?? "";
    const form = attr(el, "form");
    const qualified =
      global ||
      (form === undefined ? ctx.elementQualified : form === "qualified");
    const name: QName = { ns: qualified ? ctx.tns : "", local };
    const defaultValue = attr(el, "default") ?? attr(el, "fixed");
    const typeAttr = attr(el, "type");
    if (typeAttr !== undefined) {
      return { name, type: this.typeFromAttribute(el, typeAttr), defaultValue };
    }
    const inlineComplex = xsdChild(el, "complexType");
    if (inlineComplex !== undefined) {
      return {
        name,
        type: { kind: "complex", el: inlineComplex, ctx, name: undefined },
        defaultValue,
      };
    }
    const inlineSimple = xsdChild(el, "simpleType");
    if (inlineSimple !== undefined) {
      return {
        name,
        type: { kind: "simple", el: inlineSimple, ctx, name: undefined },
        defaultValue,
      };
    }
    const substitution = attr(el, "substitutionGroup");
    if (substitution !== undefined) {
      const head = this.findElement(resolveQName(el, substitution));
      if (head !== undefined) {
        return { name, type: head.type, defaultValue };
      }
    }
    return { name, type: ANY_TYPE, defaultValue };
  }

  isSimpleType(type: TypeRef): boolean {
    if (type.kind === "simple") {
      return true;
    }
    if (type.kind === "builtin") {
      return type.name.local !== "anyType";
    }
    return false;
  }

  complexInfo(type: TypeRef & { kind: "complex" }): ComplexInfo {
    const cached = this.complexCache.get(type.el);
    if (cached !== undefined) {
      return cached;
    }
    const placeholder: ComplexInfo = {
      content: "empty",
      particle: undefined,
      attributes: [],
      simple: undefined,
    };
    this.complexCache.set(type.el, placeholder);
    const info = this.computeComplex(type.el, type.ctx);
    Object.assign(placeholder, info);
    return placeholder;
  }

  private computeComplex(el: Element, ctx: SchemaContext): ComplexInfo {
    const mixedAttr = attr(el, "mixed") === "true";
    const simpleContent = xsdChild(el, "simpleContent");
    if (simpleContent !== undefined) {
      const derivation =
        xsdChild(simpleContent, "extension") ??
        xsdChild(simpleContent, "restriction");
      if (derivation === undefined) {
        return {
          content: "simple",
          particle: undefined,
          attributes: [],
          simple: ANY_SIMPLE,
        };
      }
      const base = this.derivationBase(derivation);
      let simple: TypeRef = base;
      let baseAttributes: AttributeUse[] = [];
      if (base.kind === "complex") {
        const baseInfo = this.complexInfo(base);
        simple = baseInfo.simple ?? ANY_SIMPLE;
        baseAttributes = baseInfo.attributes;
      }
      if (derivation.localName === "restriction") {
        const inline = xsdChild(derivation, "simpleType");
        if (inline !== undefined) {
          simple = { kind: "simple", el: inline, ctx, name: undefined };
        } else if (this.hasFacets(derivation)) {
          simple = { kind: "simple", el: derivation, ctx, name: undefined };
        }
      }
      return {
        content: "simple",
        particle: undefined,
        attributes: mergeAttributes(
          baseAttributes,
          this.collectAttributes(derivation, ctx),
        ),
        simple,
      };
    }

    const complexContent = xsdChild(el, "complexContent");
    if (complexContent !== undefined) {
      const mixed = mixedAttr || attr(complexContent, "mixed") === "true";
      const derivation =
        xsdChild(complexContent, "extension") ??
        xsdChild(complexContent, "restriction");
      if (derivation === undefined) {
        return {
          content: mixed ? "mixed" : "empty",
          particle: undefined,
          attributes: [],
          simple: undefined,
        };
      }
      const base = this.derivationBase(derivation);
      const baseInfo =
        base.kind === "complex" ? this.complexInfo(base) : undefined;
      const own = this.particleOf(derivation, ctx);
      let particle: Particle | undefined;
      if (derivation.localName === "extension") {
        const baseParticle = baseInfo?.particle;
        if (baseParticle !== undefined && own !== undefined) {
          particle = {
            kind: "sequence",
            children: [baseParticle, own],
            min: 1,
            max: 1,
          };
        } else {
          particle = baseParticle ?? own;
        }
      } else {
        particle = own;
      }
      particle = particle === undefined ? undefined : normalize(particle);
      return {
        content:
          particle !== undefined
            ? mixed
              ? "mixed"
              : "element"
            : mixed
              ? "mixed"
              : "empty",
        particle,
        attributes: mergeAttributes(
          baseInfo?.attributes ?? [],
          this.collectAttributes(derivation, ctx),
        ),
        simple: undefined,
      };
    }

    const own = this.particleOf(el, ctx);
    const particle = own === undefined ? undefined : normalize(own);
    return {
      content:
        particle !== undefined
          ? mixedAttr
            ? "mixed"
            : "element"
          : mixedAttr
            ? "mixed"
            : "empty",
      particle,
      attributes: this.collectAttributes(el, ctx),
      simple: undefined,
    };
  }

  private hasFacets(el: Element) {
    return xsdChildren(el).some(
      (c) =>
        c.localName !== "attribute" &&
        c.localName !== "attributeGroup" &&
        c.localName !== "anyAttribute" &&
        c.localName !== "annotation",
    );
  }

  private derivationBase(derivation: Element): TypeRef {
    const base = attr(derivation, "base");
    return base === undefined
      ? ANY_TYPE
      : this.typeFromAttribute(derivation, base);
  }

  private particleOf(
    container: Element,
    ctx: SchemaContext,
  ): Particle | undefined {
    for (const child of xsdChildren(container)) {
      const particle = this.particle(child, ctx);
      if (particle !== undefined) {
        return particle;
      }
    }
    return undefined;
  }

  private particle(el: Element, ctx: SchemaContext): Particle | undefined {
    switch (el.localName) {
      case "element": {
        let cached: ElementDecl | undefined;
        return {
          kind: "element",
          decl: () => (cached ??= this.elementDecl(el, ctx, false)),
          ...parseOccurs(el),
        };
      }
      case "sequence":
      case "choice":
      case "all": {
        const children: Particle[] = [];
        for (const c of xsdChildren(el)) {
          const p = this.particle(c, ctx);
          if (p !== undefined) {
            children.push(p);
          }
        }
        return { kind: el.localName, children, ...parseOccurs(el) };
      }
      case "group": {
        const ref = attr(el, "ref");
        if (ref === undefined) {
          return undefined;
        }
        const decl = this.groups.get(qkey(resolveQName(el, ref)));
        if (decl === undefined) {
          return undefined;
        }
        const inner = this.particleOf(decl.el, decl.ctx);
        if (
          inner === undefined ||
          inner.kind === "element" ||
          inner.kind === "any"
        ) {
          return inner;
        }
        return { ...inner, ...parseOccurs(el) };
      }
      case "any":
        return { kind: "any", ...parseOccurs(el) };
      default:
        return undefined;
    }
  }

  private collectAttributes(
    container: Element,
    ctx: SchemaContext,
    seen = new Set<Element>(),
  ): AttributeUse[] {
    const result: AttributeUse[] = [];
    for (const child of xsdChildren(container)) {
      if (child.localName === "attribute") {
        result.push(this.attributeUse(child, ctx));
      } else if (child.localName === "attributeGroup") {
        const ref = attr(child, "ref");
        if (ref === undefined) {
          continue;
        }
        const decl = this.attributeGroups.get(qkey(resolveQName(child, ref)));
        if (decl === undefined || seen.has(decl.el)) {
          continue;
        }
        seen.add(decl.el);
        result.push(...this.collectAttributes(decl.el, decl.ctx, seen));
      }
    }
    return result;
  }

  private attributeUse(el: Element, ctx: SchemaContext): AttributeUse {
    const use = attr(el, "use");
    const required = use === "required";
    const prohibited = use === "prohibited";
    const wsdlArrayTypeRaw = el.getAttributeNS(NS.WSDL, "arrayType");
    const wsdlArrayType =
      wsdlArrayTypeRaw !== null && wsdlArrayTypeRaw !== ""
        ? parseArrayType(el, wsdlArrayTypeRaw)
        : undefined;
    const ref = attr(el, "ref");
    const ownDefault = attr(el, "default") ?? attr(el, "fixed");
    if (ref !== undefined) {
      const name = resolveQName(el, ref);
      const decl = this.attributes.get(qkey(name));
      let type: TypeRef = ANY_SIMPLE;
      let defaultValue = ownDefault;
      if (decl !== undefined) {
        type = this.attributeType(decl.el, decl.ctx);
        defaultValue ??= attr(decl.el, "default") ?? attr(decl.el, "fixed");
      } else if (name.ns === NS.XML) {
        type = { kind: "builtin", name: { ns: NS.XSD, local: "language" } };
      }
      return { name, type, defaultValue, required, prohibited, wsdlArrayType };
    }
    const form = attr(el, "form");
    const qualified =
      form === undefined ? ctx.attributeQualified : form === "qualified";
    return {
      name: { ns: qualified ? ctx.tns : "", local: attr(el, "name") ?? "" },
      type: this.attributeType(el, ctx),
      defaultValue: ownDefault,
      required,
      prohibited,
      wsdlArrayType,
    };
  }

  private attributeType(el: Element, ctx: SchemaContext): TypeRef {
    const typeAttr = attr(el, "type");
    if (typeAttr !== undefined) {
      return this.typeFromAttribute(el, typeAttr);
    }
    const inline = xsdChild(el, "simpleType");
    if (inline !== undefined) {
      return { kind: "simple", el: inline, ctx, name: undefined };
    }
    return ANY_SIMPLE;
  }

  simpleInfo(type: TypeRef): SimpleInfo {
    if (type.kind === "builtin") {
      return builtinInfo(type.name.local);
    }
    if (type.kind === "unresolved") {
      return { ...builtinInfo("string"), name: type.name };
    }
    if (type.kind === "complex") {
      const info = this.complexInfo(type);
      return info.simple !== undefined
        ? this.simpleInfo(info.simple)
        : builtinInfo("anySimpleType");
    }
    const cached = this.simpleCache.get(type.el);
    if (cached !== undefined) {
      return cached;
    }
    const placeholder = builtinInfo("string");
    this.simpleCache.set(type.el, placeholder);
    const info = { ...this.computeSimple(type.el, type.ctx), name: type.name };
    Object.assign(placeholder, info);
    return placeholder;
  }

  private computeSimple(el: Element, ctx: SchemaContext): SimpleInfo {
    const restriction =
      el.localName === "restriction" ? el : xsdChild(el, "restriction");
    if (restriction !== undefined) {
      const baseAttr = attr(restriction, "base");
      const inline = xsdChild(restriction, "simpleType");
      const base: TypeRef =
        baseAttr !== undefined
          ? this.typeFromAttribute(restriction, baseAttr)
          : inline !== undefined
            ? { kind: "simple", el: inline, ctx, name: undefined }
            : ANY_SIMPLE;
      const baseInfo = this.simpleInfo(base);
      const enumerations = xsdChildren(restriction, "enumeration").map(
        (e) => attr(e, "value") ?? "",
      );
      const facets: SimpleFacets = { ...baseInfo.facets };
      const num = (name: string) => {
        const f = xsdChild(restriction, name);
        const v = f === undefined ? undefined : attr(f, "value");
        return v === undefined ? undefined : parseInt(v, 10);
      };
      const str = (name: string) => {
        const f = xsdChild(restriction, name);
        return f === undefined ? undefined : attr(f, "value");
      };
      const assign = <K extends keyof SimpleFacets>(
        key: K,
        value: SimpleFacets[K] | undefined,
      ) => {
        if (value !== undefined) {
          facets[key] = value;
        }
      };
      assign("length", num("length"));
      assign("minLength", num("minLength"));
      assign("maxLength", num("maxLength"));
      assign("totalDigits", num("totalDigits"));
      assign("fractionDigits", num("fractionDigits"));
      assign("minInclusive", str("minInclusive"));
      assign("maxInclusive", str("maxInclusive"));
      assign("minExclusive", str("minExclusive"));
      assign("maxExclusive", str("maxExclusive"));
      return {
        ...baseInfo,
        enumerations:
          enumerations.length > 0 ? enumerations : baseInfo.enumerations,
        facets,
      };
    }
    const list = xsdChild(el, "list");
    if (list !== undefined) {
      const itemAttr = attr(list, "itemType");
      const inline = xsdChild(list, "simpleType");
      const itemType: TypeRef =
        itemAttr !== undefined
          ? this.typeFromAttribute(list, itemAttr)
          : inline !== undefined
            ? { kind: "simple", el: inline, ctx, name: undefined }
            : ANY_SIMPLE;
      return { ...builtinInfo("string"), variety: "list", itemType };
    }
    const union = xsdChild(el, "union");
    if (union !== undefined) {
      const memberTypes: TypeRef[] = [];
      const members = attr(union, "memberTypes");
      if (members !== undefined) {
        for (const m of members.split(/\s+/).filter((s) => s !== "")) {
          memberTypes.push(this.typeFromAttribute(union, m));
        }
      }
      for (const inline of xsdChildren(union, "simpleType")) {
        memberTypes.push({ kind: "simple", el: inline, ctx, name: undefined });
      }
      return { ...builtinInfo("string"), variety: "union", memberTypes };
    }
    return builtinInfo("anySimpleType");
  }
}

function builtinInfo(local: string): SimpleInfo {
  const name = { ns: NS.XSD, local };
  if (local === "anyType") {
    return {
      variety: "anyType",
      builtin: local,
      name,
      enumerations: [],
      facets: {},
      itemType: undefined,
      memberTypes: [],
    };
  }
  if (local === "anySimpleType") {
    return {
      variety: "anySimpleType",
      builtin: local,
      name,
      enumerations: [],
      facets: {},
      itemType: undefined,
      memberTypes: [],
    };
  }
  const listItem = BUILTIN_LISTS[local];
  if (listItem !== undefined) {
    return {
      variety: "list",
      builtin: local,
      name,
      enumerations: [],
      facets: { minLength: 1 },
      itemType: { kind: "builtin", name: { ns: NS.XSD, local: listItem } },
      memberTypes: [],
    };
  }
  return {
    variety: "atomic",
    builtin: local in PRIMITIVES ? local : "string",
    name,
    enumerations: [],
    facets: {},
    itemType: undefined,
    memberTypes: [],
  };
}

function parseArrayType(el: Element, value: string): QNameWithSuffix {
  const bracket = value.indexOf("[");
  const base = bracket >= 0 ? value.substring(0, bracket) : value;
  const suffix = bracket >= 0 ? value.substring(bracket) : "";
  return { name: resolveQName(el, base), suffix };
}

function mergeAttributes(
  base: AttributeUse[],
  own: AttributeUse[],
): AttributeUse[] {
  const result = base.filter(
    (b) => !own.some((o) => qkey(o.name) === qkey(b.name)),
  );
  result.push(...own);
  return result.filter((a) => !a.prohibited);
}

function normalize(p: Particle): Particle | undefined {
  if (p.kind === "element" || p.kind === "any") {
    return p;
  }
  const children: Particle[] = [];
  for (const raw of p.children) {
    const child = normalize(raw);
    if (child === undefined) {
      continue;
    }
    if (
      child.kind === p.kind &&
      p.kind !== "all" &&
      child.min === 1 &&
      child.max === 1
    ) {
      children.push(...(child as { children: Particle[] }).children);
    } else {
      children.push(child);
    }
  }
  if (children.length === 0) {
    return undefined;
  }
  const only = children[0];
  if (
    children.length === 1 &&
    only !== undefined &&
    p.min === 1 &&
    p.max === 1
  ) {
    return only;
  }
  return { ...p, children };
}
