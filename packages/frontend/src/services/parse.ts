import type { HttpTarget, ParseSource } from "shared";

import { useHeadersStore } from "@/stores/headers";
import { useWsdlerStore } from "@/stores/wsdler";
import type { FrontendSDK } from "@/types";
import { applyCustomHeaders, requestName } from "@/wsdl/request";
import { type Fetcher, WsdlDefinition } from "@/wsdl/wsdl";

type ParseOutcome =
  | { kind: "Ok"; tabName: string; operations: number }
  | { kind: "Error"; error: string };

type LocalFile = { name: string; text: string };

const FILE_BASE = "file:///";
const LOCAL_BASE_REQUEST = "GET / HTTP/1.1\r\nHost: localhost\r\n\r\n";

const withCustomHeaders = (raw: string) =>
  applyCustomHeaders(raw, [], useHeadersStore().activeHeaders.value);

const backendFetcher =
  (sdk: FrontendSDK, baseRequest: string): Fetcher =>
  async (documentUrl: string) => {
    const result = await sdk.backend.fetchDocument(baseRequest, documentUrl);
    if (result.kind === "Error") {
      throw new Error(result.error);
    }
    return result.value;
  };

async function buildTab(
  name: string,
  url: string,
  text: string,
  baseRequest: string,
  originalTarget: HttpTarget | undefined,
  fetcher: Fetcher,
): Promise<ParseOutcome> {
  let definition: WsdlDefinition;
  try {
    definition = await WsdlDefinition.load(url, text, fetcher);
  } catch (e) {
    return { kind: "Error", error: e instanceof Error ? e.message : String(e) };
  }

  const { operations, failures } = definition.operations();
  if (operations.length === 0) {
    const reason =
      failures.length > 0
        ? failures.join("\n")
        : "No SOAP bindings/operations found in the WSDL";
    return { kind: "Error", error: reason };
  }

  const warnings = [
    ...definition.warnings.map((w) => `Could not load ${w.url}: ${w.message}`),
    ...failures.map((f) => `Skipped ${f}`),
  ];
  if (operations.some((op) => op.endpoints.length === 0)) {
    warnings.push(
      originalTarget === undefined
        ? "Some bindings have no soap:address; set the endpoint before sending"
        : "Some bindings have no soap:address; the WSDL URL is used as endpoint",
    );
  }

  useWsdlerStore().addTab({
    name,
    url,
    baseRequest,
    originalTarget,
    warnings,
    entries: operations.map((op) => ({
      operationName: op.operationName,
      bindingName: op.bindingName,
      soapAction: op.soapAction,
      soapVersion: op.soapVersion,
      endpoints: op.endpoints,
      envelope: op.envelope,
    })),
  });
  return { kind: "Ok", tabName: name, operations: operations.length };
}

export async function parseWsdl(
  sdk: FrontendSDK,
  source: ParseSource,
): Promise<ParseOutcome> {
  const loaded = await sdk.backend.loadSource(source);
  if (loaded.kind === "Error") {
    return { kind: "Error", error: `Can't Read Response: ${loaded.error}` };
  }
  const { url, raw, target, responseBody } = loaded.value;
  const fetchBase = withCustomHeaders(raw);

  const fetched = await sdk.backend.fetchDocument(fetchBase, url);
  let wsdlText: string;
  if (fetched.kind === "Ok" && fetched.value.trim() !== "") {
    wsdlText = fetched.value;
  } else if (responseBody !== undefined && responseBody.trim() !== "") {
    wsdlText = responseBody;
  } else {
    return {
      kind: "Error",
      error: fetched.kind === "Error" ? fetched.error : "Can't Read Response",
    };
  }

  return buildTab(
    requestName(url),
    url,
    wsdlText,
    raw,
    target,
    backendFetcher(sdk, fetchBase),
  );
}

export async function parseWsdlFiles(
  sdk: FrontendSDK,
  files: LocalFile[],
): Promise<ParseOutcome[]> {
  const byUrl = new Map(
    files.map((f) => [
      new URL(encodeURIComponent(f.name), FILE_BASE).toString(),
      f,
    ]),
  );
  const remote = backendFetcher(sdk, withCustomHeaders(LOCAL_BASE_REQUEST));
  const fetcher: Fetcher = async (url) => {
    const local = byUrl.get(url);
    if (local !== undefined) {
      return local.text;
    }
    if (url.startsWith(FILE_BASE)) {
      const fileName = decodeURIComponent(url.substring(FILE_BASE.length));
      throw new Error(
        `Referenced file "${fileName}" was not selected; select it together with the WSDL`,
      );
    }
    return remote(url);
  };

  const wsdlFiles = files.filter((f) =>
    /<([\w-]+:)?definitions[\s>]/.test(f.text),
  );
  if (wsdlFiles.length === 0) {
    return [
      {
        kind: "Error",
        error: "None of the selected files is a WSDL 1.1 document",
      },
    ];
  }

  const outcomes: ParseOutcome[] = [];
  for (const file of wsdlFiles) {
    const url = new URL(encodeURIComponent(file.name), FILE_BASE).toString();
    outcomes.push(
      await buildTab(
        file.name.replace(/\.[^.]+$/, ""),
        url,
        file.text,
        LOCAL_BASE_REQUEST,
        undefined,
        fetcher,
      ),
    );
  }
  return outcomes;
}
