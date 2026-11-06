import type { ParseSource } from "shared";

import { useWsdlerStore } from "@/stores/wsdler";
import type { FrontendSDK } from "@/types";
import { requestName } from "@/wsdl/request";
import { WsdlDefinition } from "@/wsdl/wsdl";

type ParseOutcome =
  | { kind: "Ok"; tabName: string; operations: number }
  | { kind: "Error"; error: string };

export async function parseWsdl(
  sdk: FrontendSDK,
  source: ParseSource,
): Promise<ParseOutcome> {
  const loaded = await sdk.backend.loadSource(source);
  if (loaded.kind === "Error") {
    return { kind: "Error", error: `Can't Read Response: ${loaded.error}` };
  }
  const { url, raw, target, responseBody } = loaded.value;

  const fetched = await sdk.backend.fetchDocument(raw, url);
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

  const fetcher = async (documentUrl: string) => {
    const result = await sdk.backend.fetchDocument(raw, documentUrl);
    if (result.kind === "Error") {
      throw new Error(result.error);
    }
    return result.value;
  };

  let definition: WsdlDefinition;
  try {
    definition = await WsdlDefinition.load(url, wsdlText, fetcher);
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

  const tabName = requestName(url);
  useWsdlerStore().addTab({
    name: tabName,
    url,
    baseRequest: raw,
    originalTarget: target,
    warnings: [
      ...definition.warnings.map(
        (w) => `Could not load ${w.url}: ${w.message}`,
      ),
      ...failures.map((f) => `Skipped ${f}`),
    ],
    entries: operations.map((op) => ({
      operationName: op.operationName,
      bindingName: op.bindingName,
      soapAction: op.soapAction,
      soapVersion: op.soapVersion,
      endpoints: op.endpoints,
      envelope: op.envelope,
    })),
  });
  return { kind: "Ok", tabName, operations: operations.length };
}
