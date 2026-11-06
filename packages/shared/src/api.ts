import type { Result } from "./result";

export type HttpTarget = { host: string; port: number; isTls: boolean };

export type ParseSource =
  { kind: "id"; id: string } | { kind: "raw"; raw: string; target: HttpTarget };

export type LoadedSource = {
  url: string;
  raw: string;
  target: HttpTarget;
  responseBody: string | undefined;
};

export type API = {
  loadSource: (source: ParseSource) => Promise<Result<LoadedSource>>;
  fetchDocument: (baseRequest: string, url: string) => Promise<Result<string>>;
};
