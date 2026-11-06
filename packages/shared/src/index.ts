import type { DefinePluginPackageSpec } from "@caido/sdk-shared";

import type { API } from "./api";
import type { Events } from "./events";

export { type Result, ok, err } from "./result";
export type { API, HttpTarget, LoadedSource, ParseSource } from "./api";
export type { Events } from "./events";

export type Spec = DefinePluginPackageSpec<{
  manifestId: "wsdler";
  api: API;
  events: Events;
}>;
