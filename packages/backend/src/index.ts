import { fetchDocument, loadSource } from "./api";
import type { BackendSDK } from "./types";

export function init(sdk: BackendSDK) {
  sdk.api.register("loadSource", loadSource);
  sdk.api.register("fetchDocument", fetchDocument);
}
