import type { HttpTarget } from "shared";

import type { WsdlEntry, WsdlTab } from "@/stores/wsdler";
import type { FrontendSDK } from "@/types";
import { endpointParts } from "@/wsdl/request";

function connectionFor(tab: WsdlTab, entry: WsdlEntry): HttpTarget {
  const parts = endpointParts(entry.endpoint);
  if (parts !== undefined) {
    return parts.target;
  }
  if (tab.originalTarget !== undefined) {
    return tab.originalTarget;
  }
  throw new Error(
    `${entry.operationName} has no valid endpoint URL; set one before sending`,
  );
}

const toBase64 = (s: string) => {
  let binary = "";
  new TextEncoder()
    .encode(s)
    .forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
};

export async function sendToReplay(
  sdk: FrontendSDK,
  tab: WsdlTab,
  entry: WsdlEntry,
  raw: string,
  collectionId?: string,
) {
  const target = connectionFor(tab, entry);
  const session = await sdk.replay.createSession(
    {
      type: "Raw",
      raw,
      connectionInfo: {
        host: target.host,
        port: target.port,
        isTLS: target.isTls,
      },
    },
    collectionId,
  );
  await sdk.replay.renameSession(session.id, entry.operationName);
  return session;
}

export async function sendAllToReplay(
  sdk: FrontendSDK,
  tab: WsdlTab,
  rawFor: (entry: WsdlEntry) => string,
) {
  const collection = await sdk.replay.createCollection(`Wsdler - ${tab.name}`);
  for (const entry of tab.entries) {
    await sendToReplay(sdk, tab, entry, rawFor(entry), collection.id);
  }
  return collection;
}

export async function sendToAutomate(
  sdk: FrontendSDK,
  tab: WsdlTab,
  entry: WsdlEntry,
  raw: string,
) {
  const target = connectionFor(tab, entry);
  await sdk.graphql.createAutomateSession({
    input: {
      requestSource: {
        raw: {
          raw: toBase64(raw),
          connectionInfo: {
            host: target.host,
            port: target.port,
            isTLS: target.isTls,
          },
        },
      },
    },
  });
}
