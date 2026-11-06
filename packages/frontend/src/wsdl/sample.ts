import { JavaRandom } from "./javaRandom";
import {
  type Particle,
  primitiveOf,
  type SchemaSet,
  type SimpleInfo,
  type TypeRef,
} from "./schema";
import { NS, qeq, type QName } from "./xml";

type XAttr = {
  name: QName;
  value: string;
  qnameValue?: { name: QName; suffix: string };
};

export type XElement = {
  kind: "element";
  name: QName;
  attrs: XAttr[];
  children: XNode[];
};

export type XNode =
  XElement | { kind: "comment"; text: string } | { kind: "text"; text: string };

export const element = (name: QName): XElement => ({
  kind: "element",
  name,
  attrs: [],
  children: [],
});

const XSI_TYPE: QName = { ns: NS.XSI, local: "type" };
const XMIME_CONTENT_TYPE: QName = { ns: NS.XMIME, local: "contentType" };
const SKIPPED_SOAP_ATTRS: QName[] = [
  { ns: "", local: "href" },
  { ns: "", local: "id" },
  { ns: "http://schemas.xmlsoap.org/s/encoding/", local: "offset" },
];
const ENC_ARRAY_TYPE: QName = { ns: NS.ENC11, local: "arrayType" };

const WORDS = [
  "ipsa",
  "iovis",
  "rapidum",
  "iaculata",
  "e",
  "nubibus",
  "ignem",
  "disiecitque",
  "rates",
  "evertitque",
  "aequora",
  "ventis",
  "illum",
  "exspirantem",
  "transfixo",
  "pectore",
  "flammas",
  "turbine",
  "corripuit",
  "scopuloque",
  "infixit",
  "acuto",
  "ast",
  "ego",
  "quae",
  "divum",
  "incedo",
  "regina",
  "iovisque",
  "et",
  "soror",
  "et",
  "coniunx",
  "una",
  "cum",
  "gente",
  "tot",
  "annos",
  "bella",
  "gero",
  "et",
  "quisquam",
  "numen",
  "iunonis",
  "adorat",
  "praeterea",
  "aut",
  "supplex",
  "aris",
  "imponet",
  "honorem",
  "talia",
  "flammato",
  "secum",
  "dea",
  "corde",
  "volutans",
  "nimborum",
  "in",
  "patriam",
  "loca",
  "feta",
  "furentibus",
  "austris",
  "aeoliam",
  "venit",
  "hic",
  "vasto",
  "rex",
  "aeolus",
  "antro",
  "luctantis",
  "ventos",
  "tempestatesque",
  "sonoras",
  "imperio",
  "premit",
  "ac",
  "vinclis",
  "et",
  "carcere",
  "frenat",
  "illi",
  "indignantes",
  "magno",
  "cum",
  "murmure",
  "montis",
  "circum",
  "claustra",
  "fremunt",
  "celsa",
  "sedet",
  "aeolus",
  "arce",
  "sceptra",
  "tenens",
  "mollitque",
  "animos",
  "et",
  "temperat",
  "iras",
  "ni",
  "faciat",
  "maria",
  "ac",
  "terras",
  "caelumque",
  "profundum",
  "quippe",
  "ferant",
  "rapidi",
  "secum",
  "verrantque",
  "per",
  "auras",
  "sed",
  "pater",
  "omnipotens",
  "speluncis",
  "abdidit",
  "atris",
  "hoc",
  "metuens",
  "molemque",
  "et",
  "montis",
  "insuper",
  "altos",
  "imposuit",
  "regemque",
  "dedit",
  "qui",
  "foedere",
  "certo",
  "et",
  "premere",
  "et",
  "laxas",
  "sciret",
  "dare",
  "iussus",
  "habenas",
];

const DNS1 = ["corp", "your", "my", "sample", "company", "test", "any"];
const DNS2 = ["com", "org", "com", "gov", "org", "com", "org", "com", "edu"];

const DECIMAL_SAMPLES: Record<string, string> = {
  short: "1",
  unsignedShort: "5",
  byte: "2",
  unsignedByte: "6",
  int: "3",
  unsignedInt: "7",
  long: "10",
  unsignedLong: "11",
  integer: "100",
  nonPositiveInteger: "-200",
  negativeInteger: "-201",
  nonNegativeInteger: "200",
  positiveInteger: "201",
};

type SampleOptions = {
  soapEnc: boolean;
  typeComments: boolean;
  skipComments: boolean;
  ignoreOptional: boolean;
};

export class SampleGenerator {
  private readonly random = new JavaRandom(1);
  private readonly typeStack: TypeRef[] = [];

  constructor(
    private readonly schemas: SchemaSet,
    private readonly options: SampleOptions,
  ) {}

  get soapEnc() {
    return this.options.soapEnc;
  }

  private pick(n: number): number {
    return this.random.nextInt(n);
  }

  private pickWord(): string {
    return WORDS[this.pick(WORDS.length)] ?? "";
  }

  private pickWords(count: number): string {
    let remaining = count <= 0 ? 1 : count;
    let i = this.pick(WORDS.length);
    let sb = WORDS[i] ?? "";
    while (remaining-- > 0) {
      i += 1;
      if (i >= WORDS.length) {
        i = 0;
      }
      sb += " " + (WORDS[i] ?? "");
    }
    return sb;
  }

  private comment(target: XElement, text: string) {
    target.children.push({ kind: "comment", text });
  }

  private text(target: XElement, text: string) {
    target.children.push({ kind: "text", text });
  }

  createSampleForType(type: TypeRef, target: XElement) {
    if (this.typeStack.some((t) => sameType(t, type))) {
      return;
    }
    this.typeStack.push(type);
    try {
      if (type.kind !== "complex") {
        this.processSimpleType(type, target);
        return;
      }
      this.processAttributes(type, target);
      const info = this.schemas.complexInfo(type);
      switch (info.content) {
        case "empty":
          break;
        case "simple":
          this.processSimpleType(type, target);
          break;
        case "mixed":
          this.text(target, this.pickWord() + " ");
          if (info.particle !== undefined) {
            this.processParticle(info.particle, target, true);
          }
          this.text(target, this.pickWord());
          break;
        case "element":
          if (info.particle !== undefined) {
            this.processParticle(info.particle, target, false);
          }
          break;
      }
    } finally {
      this.typeStack.pop();
    }
  }

  private processSimpleType(type: TypeRef, target: XElement) {
    if (this.options.soapEnc) {
      const typeName = typeNameOf(type);
      if (typeName !== undefined) {
        setAttr(target, {
          name: XSI_TYPE,
          value: "",
          qnameValue: { name: typeName, suffix: "" },
        });
      }
    }
    this.text(target, this.sampleDataForSimpleType(type));
  }

  sampleDataForSimpleType(type: TypeRef): string {
    const name = typeNameOf(type);
    if (name !== undefined) {
      if (
        qeq(name, { ns: NS.SWAREF, local: "swaRef" }) ||
        qeq(name, { ns: NS.XMIME, local: "base64Binary" }) ||
        qeq(name, { ns: NS.XMIME, local: "hexBinary" })
      ) {
        return "cid:" + Math.floor(Date.now() * Math.random()).toString();
      }
    }
    if (type.kind === "builtin" && type.name.local === "anyType") {
      return "anyType";
    }
    if (type.kind === "builtin" && type.name.local === "anySimpleType") {
      return "anySimpleType";
    }
    if (
      type.kind === "complex" &&
      this.schemas.complexInfo(type).simple === undefined
    ) {
      return "anyType";
    }
    return this.sampleForInfo(this.schemas.simpleInfo(type));
  }

  private sampleForInfo(info: SimpleInfo): string {
    if (info.variety === "anyType") {
      return "anyType";
    }
    if (info.variety === "anySimpleType") {
      return "anySimpleType";
    }
    if (info.variety === "list") {
      const length = this.pickLength(info);
      const item = info.itemType;
      if (item === undefined) {
        return "";
      }
      const parts: string[] = [];
      if (length > 0) {
        parts.push(this.sampleDataForSimpleType(item));
      }
      for (let i = 1; i < length; i++) {
        parts.push(this.sampleDataForSimpleType(item));
      }
      return parts.join(" ");
    }
    if (info.variety === "union") {
      if (info.memberTypes.length === 0) {
        return "";
      }
      const member = info.memberTypes[this.pick(info.memberTypes.length)];
      return member === undefined ? "" : this.sampleDataForSimpleType(member);
    }
    if (info.enumerations.length > 0) {
      return info.enumerations[this.pick(info.enumerations.length)] ?? "";
    }
    const builtin = info.builtin;
    switch (primitiveOf(builtin)) {
      case "boolean":
        return this.pick(2) === 0 ? "true" : "false";
      case "base64Binary":
        return utf8ToBase64(this.formatToLength(this.pickWord(), info));
      case "hexBinary":
        return utf8ToHex(this.formatToLength(this.pickWord(), info));
      case "anyURI":
        return this.formatToLength(
          "http://www." +
            (DNS1[this.pick(DNS1.length)] ?? "") +
            "." +
            (DNS2[this.pick(DNS2.length)] ?? "") +
            "/" +
            this.pickWord() +
            "/" +
            this.pickWord(),
          info,
        );
      case "QName":
        return this.formatToLength("qname", info);
      case "NOTATION":
        return this.formatToLength("notation", info);
      case "float":
        return "1.25";
      case "double":
        return "1.30";
      case "decimal":
        return formatDecimal(DECIMAL_SAMPLES[builtin] ?? "1000.00", info);
      case "string":
        return this.formatToLength(this.pickWords(this.pick(3)), info);
      case "duration":
        return this.formatDuration();
      case "dateTime":
      case "time":
      case "date":
      case "gYearMonth":
      case "gYear":
      case "gMonthDay":
      case "gDay":
      case "gMonth":
        return this.formatDate(primitiveOf(builtin));
      default:
        return "";
    }
  }

  private pickLength(info: SimpleInfo): number {
    const { length, minLength, maxLength } = info.facets;
    if (length !== undefined) {
      return length;
    }
    let minInt = minLength ?? 0;
    let maxInt = maxLength ?? 2147483647;
    if (minInt === 0 && maxInt >= 1) {
      minInt = 1;
    }
    if (maxInt > minInt + 2) {
      maxInt = minInt + 2;
    }
    if (maxInt < minInt) {
      maxInt = minInt;
    }
    return minInt + this.pick(maxInt - minInt);
  }

  private formatToLength(s: string, info: SimpleInfo): string {
    let result = s;
    const min = info.facets.length ?? info.facets.minLength;
    if (min !== undefined && result.length > 0) {
      while (result.length < min) {
        result = result + result;
      }
    }
    const max = info.facets.length ?? info.facets.maxLength;
    if (max !== undefined && result.length > max) {
      result = result.substring(0, max);
    }
    return result;
  }

  private formatDuration(): string {
    let seconds = this.pick(800000);
    let months = this.pick(20);
    let minutes = Math.floor(seconds / 60);
    seconds %= 60;
    let hours = Math.floor(minutes / 60);
    minutes %= 60;
    const days = Math.floor(hours / 24);
    hours %= 24;
    const years = Math.floor(months / 12);
    months %= 12;
    let out = "P";
    if (years > 0) out += `${years}Y`;
    if (months > 0) out += `${months}M`;
    if (days > 0) out += `${days}D`;
    if (hours > 0 || minutes > 0 || seconds > 0) {
      out += "T";
      if (hours > 0) out += `${hours}H`;
      if (minutes > 0) out += `${minutes}M`;
      if (seconds > 0) out += `${seconds}S`;
    }
    return out === "P" ? "PT0S" : out;
  }

  private formatDate(primitive: string): string {
    const secondsInYear = 365 * 24 * 60 * 60;
    const offsetSeconds = this.pick(secondsInYear);
    const years = 30 + this.pick(20);
    const date = new Date(1000 * offsetSeconds + years * secondsInYear * 1000);
    const keepTimezone = this.pick(2) !== 0;
    const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, "0");
    const tzMinutes = -date.getTimezoneOffset();
    const tz = !keepTimezone
      ? ""
      : tzMinutes === 0
        ? "Z"
        : `${tzMinutes > 0 ? "+" : "-"}${pad(Math.floor(Math.abs(tzMinutes) / 60))}:${pad(Math.abs(tzMinutes) % 60)}`;
    const y = pad(date.getFullYear(), 4);
    const mo = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    switch (primitive) {
      case "dateTime":
        return `${y}-${mo}-${d}T${time}${tz}`;
      case "time":
        return `${time}${tz}`;
      case "date":
        return `${y}-${mo}-${d}${tz}`;
      case "gYearMonth":
        return `${y}-${mo}${tz}`;
      case "gYear":
        return `${y}${tz}`;
      case "gMonthDay":
        return `--${mo}-${d}${tz}`;
      case "gDay":
        return `---${d}${tz}`;
      default:
        return `--${mo}${tz}`;
    }
  }

  processParticle(p: Particle, target: XElement, mixed: boolean) {
    let loop = this.determineMinMaxForSample(p, target);
    while (loop-- > 0) {
      switch (p.kind) {
        case "element":
          this.processElement(p, target);
          break;
        case "sequence":
          p.children.forEach((child, i) => {
            this.processParticle(child, target, mixed);
            if (mixed && i < p.children.length - 1) {
              this.text(target, this.pickWord());
            }
          });
          break;
        case "choice":
          if (!this.options.skipComments) {
            this.comment(
              target,
              `You have a CHOICE of the next ${p.children.length} items at this level`,
            );
          }
          for (const child of p.children) {
            this.processParticle(child, target, mixed);
          }
          break;
        case "all":
          if (!this.options.skipComments) {
            this.comment(
              target,
              `You may enter the following ${p.children.length} items in any order`,
            );
          }
          p.children.forEach((child, i) => {
            this.processParticle(child, target, mixed);
            if (mixed && i < p.children.length - 1) {
              this.text(target, this.pickWord());
            }
          });
          break;
        case "any":
          if (!this.options.skipComments) {
            this.comment(target, "You may enter ANY elements at this point");
          }
          break;
      }
    }
  }

  private determineMinMaxForSample(p: Particle, target: XElement): number {
    const { min, max } = p;
    if (min === max) {
      return min;
    }
    if (min === 0 && this.options.ignoreOptional) {
      return 0;
    }
    const result = min === 0 ? 1 : min;
    if (p.kind !== "element") {
      return result;
    }
    if (!this.options.skipComments) {
      if (max === "unbounded") {
        this.comment(
          target,
          min === 0
            ? "Zero or more repetitions:"
            : `${min} or more repetitions:`,
        );
      } else if (max > 1) {
        this.comment(target, `${min} to ${max} repetitions:`);
      } else {
        this.comment(target, "Optional:");
      }
    }
    return result;
  }

  private processElement(p: Particle & { kind: "element" }, target: XElement) {
    const decl = p.decl();
    this.addElementTypeAndRestrictionsComment(decl.type, target);
    const el = element(
      this.options.soapEnc ? { ns: "", local: decl.name.local } : decl.name,
    );
    target.children.push(el);
    if (decl.defaultValue !== undefined) {
      this.text(el, decl.defaultValue);
    } else {
      this.createSampleForType(decl.type, el);
    }
  }

  private addElementTypeAndRestrictionsComment(
    type: TypeRef,
    target: XElement,
  ) {
    if (!this.options.typeComments || !this.schemas.isSimpleType(type)) {
      return;
    }
    const info = this.schemas.simpleInfo(type);
    const enumInfo =
      info.enumerations.length > 0
        ? ` - enumeration: [${info.enumerations.join(",")}]`
        : "";
    const name = typeNameOf(type);
    this.comment(
      target,
      name === undefined
        ? `anonymous type${enumInfo}`
        : `type: ${name.local}${enumInfo}`,
    );
  }

  private processAttributes(
    type: TypeRef & { kind: "complex" },
    target: XElement,
  ) {
    if (this.options.soapEnc && type.name !== undefined) {
      setAttr(target, {
        name: XSI_TYPE,
        value: "",
        qnameValue: { name: type.name, suffix: "" },
      });
    }
    const info = this.schemas.complexInfo(type);
    for (const a of info.attributes) {
      if (!a.required && this.options.ignoreOptional) {
        continue;
      }
      if (qeq(a.name, XMIME_CONTENT_TYPE)) {
        setAttr(target, { name: a.name, value: "application/?" });
        continue;
      }
      if (this.options.soapEnc) {
        if (SKIPPED_SOAP_ATTRS.some((s) => qeq(s, a.name))) {
          continue;
        }
        if (qeq(a.name, ENC_ARRAY_TYPE)) {
          if (a.wsdlArrayType !== undefined) {
            setAttr(target, {
              name: a.name,
              value: "",
              qnameValue: a.wsdlArrayType,
            });
          }
          continue;
        }
      }
      setAttr(target, {
        name: a.name,
        value: a.defaultValue ?? this.sampleDataForSimpleType(a.type),
      });
    }
  }
}

function setAttr(target: XElement, a: XAttr) {
  const existing = target.attrs.findIndex((x) => qeq(x.name, a.name));
  if (existing >= 0) {
    target.attrs[existing] = a;
  } else {
    target.attrs.push(a);
  }
}

function typeNameOf(type: TypeRef): QName | undefined {
  return type.kind === "builtin" || type.kind === "unresolved"
    ? type.name
    : type.name;
}

function sameType(a: TypeRef, b: TypeRef): boolean {
  if (a.kind === "complex" && b.kind === "complex") return a.el === b.el;
  if (a.kind === "simple" && b.kind === "simple") return a.el === b.el;
  return false;
}

function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function utf8ToHex(s: string): string {
  return Array.from(new TextEncoder().encode(s))
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join("");
}

function decimalPlaces(s: string): number {
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

function formatDecimal(start: string, info: SimpleInfo): string {
  const f = info.facets;
  let min: string | undefined = f.minInclusive;
  let max: string | undefined = f.maxInclusive;
  let minInclusive = true;
  let maxInclusive = true;
  if (
    f.minExclusive !== undefined &&
    (min === undefined || Number(min) < Number(f.minExclusive))
  ) {
    min = f.minExclusive;
    minInclusive = false;
  }
  if (
    f.maxExclusive !== undefined &&
    (max === undefined || Number(max) > Number(f.maxExclusive))
  ) {
    max = f.maxExclusive;
    maxInclusive = false;
  }
  if (f.totalDigits !== undefined) {
    const limit = "9".repeat(f.totalDigits);
    if (max !== undefined && Number(max) > Number(limit)) {
      max = limit;
      maxInclusive = true;
    }
    if (min !== undefined && Number(min) < -Number(limit)) {
      min = "-" + limit;
      minInclusive = true;
    }
  }
  const value = Number(start);
  const sigMin = min === undefined ? 1 : Math.sign(value - Number(min));
  const sigMax = max === undefined ? -1 : Math.sign(value - Number(max));
  const minOk = sigMin > 0 || (sigMin === 0 && minInclusive);
  const maxOk = sigMax < 0 || (sigMax === 0 && maxInclusive);
  const increment =
    f.fractionDigits !== undefined && f.fractionDigits > 0
      ? "0." + "0".repeat(f.fractionDigits - 1) + "1"
      : "1";
  const shift = (base: string, sign: number) => {
    const places = Math.max(decimalPlaces(base), decimalPlaces(increment));
    return (Number(base) + sign * Number(increment)).toFixed(places);
  };
  if (minOk && !maxOk && max !== undefined) {
    return maxInclusive ? max : shift(max, -1);
  }
  if (!minOk && maxOk && min !== undefined) {
    return minInclusive ? min : shift(min, 1);
  }
  return start;
}
