import { computed, ref, watch } from "vue";

import type { FrontendSDK } from "@/types";
import type { HeaderPair } from "@/wsdl/request";

type CustomHeader = {
  id: string;
  enabled: boolean;
  name: string;
  value: string;
};

let counter = 0;
const nextId = () => `h-${Date.now().toString(36)}-${(counter++).toString(36)}`;

const headers = ref<CustomHeader[]>([]);

const isValid = (h: CustomHeader) =>
  /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(h.name.trim());

const activeHeaders = computed<HeaderPair[]>(() =>
  headers.value
    .filter((h) => h.enabled && isValid(h))
    .map((h) => ({ name: h.name.trim(), value: h.value })),
);

const allNames = computed(() =>
  headers.value.filter(isValid).map((h) => h.name.trim()),
);

const parseStored = (value: unknown): CustomHeader[] => {
  if (
    typeof value !== "object" ||
    value === null ||
    !("customHeaders" in value)
  ) {
    return [];
  }
  const list = value.customHeaders;
  if (!Array.isArray(list)) {
    return [];
  }
  return list.flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }
    const h = item as Record<string, unknown>;
    return [
      {
        id: nextId(),
        enabled: h.enabled === true,
        name: typeof h.name === "string" ? h.name : "",
        value: typeof h.value === "string" ? h.value : "",
      },
    ];
  });
};

export function initHeaders(sdk: FrontendSDK) {
  headers.value = parseStored(sdk.storage.get());
  watch(
    headers,
    (list) => {
      void sdk.storage.set({
        customHeaders: list.map(({ enabled, name, value }) => ({
          enabled,
          name,
          value,
        })),
      });
    },
    { deep: true },
  );
}

export function useHeadersStore() {
  const add = (name = "", value = "") => {
    headers.value.push({ id: nextId(), enabled: true, name, value });
  };
  const remove = (id: string) => {
    headers.value = headers.value.filter((h) => h.id !== id);
  };
  return { headers, activeHeaders, allNames, add, remove };
}
