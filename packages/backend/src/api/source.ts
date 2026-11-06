import {
  err,
  type LoadedSource,
  ok,
  type ParseSource,
  type Result,
} from "shared";

import { fetchText, targetUrl } from "../services/http";
import type { BackendSDK } from "../types";

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : String(e);

export async function loadSource(
  sdk: BackendSDK,
  source: ParseSource,
): Promise<Result<LoadedSource>> {
  try {
    if (source.kind === "raw") {
      return ok({
        url: targetUrl(source.target, source.raw),
        raw: source.raw,
        target: source.target,
        responseBody: undefined,
      });
    }

    const entry = await sdk.requests.get(source.id);
    if (entry === undefined) {
      return err(`Request ${source.id} not found`);
    }
    const { request } = entry;
    let response = entry.response;
    if (response === undefined) {
      const sent = await sdk.requests.send(request.toSpecRaw());
      response = sent.response;
    }
    return ok({
      url: request.getUrl(),
      raw: request.getRaw().toText(),
      target: {
        host: request.getHost(),
        port: request.getPort(),
        isTls: request.getTls(),
      },
      responseBody: response?.getBody()?.toText(),
    });
  } catch (e) {
    return err(errorMessage(e));
  }
}

export async function fetchDocument(
  sdk: BackendSDK,
  baseRequest: string,
  url: string,
): Promise<Result<string>> {
  try {
    return ok(await fetchText(sdk, baseRequest, url));
  } catch (e) {
    return err(errorMessage(e));
  }
}
