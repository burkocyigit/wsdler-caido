import type { HttpTarget } from "shared";
import { computed, reactive, ref } from "vue";

import { buildSoapRequest } from "@/wsdl/request";

export type WsdlEntry = {
  id: string;
  operationName: string;
  bindingName: string;
  soapAction: string;
  soapVersion: string;
  endpoints: string[];
  endpoint: string;
  envelope: string;
  request: string;
};

export type ConnectionMode = "original" | "endpoint";

export type WsdlTab = {
  id: string;
  name: string;
  url: string;
  baseRequest: string;
  originalTarget: HttpTarget;
  entries: WsdlEntry[];
  warnings: string[];
  connectionMode: ConnectionMode;
  selectedId: string | undefined;
};

let counter = 0;
const nextId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

const tabs = ref<WsdlTab[]>([]);
const activeTabId = ref<string | undefined>(undefined);

export function useWsdlerStore() {
  const activeTab = computed(() =>
    tabs.value.find((t) => t.id === activeTabId.value),
  );

  const addTab = (
    tab: Omit<WsdlTab, "id" | "selectedId" | "connectionMode" | "entries"> & {
      entries: Omit<WsdlEntry, "id" | "request" | "endpoint">[];
    },
  ) => {
    const created: WsdlTab = reactive({
      ...tab,
      id: nextId(),
      connectionMode: "original",
      selectedId: undefined,
      entries: tab.entries.map((e) => {
        const endpoint = e.endpoints[0] ?? tab.url;
        return {
          ...e,
          id: nextId(),
          endpoint,
          request: buildSoapRequest(
            tab.baseRequest,
            endpoint,
            e.soapAction,
            e.envelope,
          ),
        };
      }),
    });
    created.selectedId = created.entries[0]?.id;
    tabs.value.push(created);
    activeTabId.value = created.id;
    return created;
  };

  const closeTab = (id: string) => {
    const index = tabs.value.findIndex((t) => t.id === id);
    if (index < 0) {
      return;
    }
    tabs.value.splice(index, 1);
    if (activeTabId.value === id) {
      activeTabId.value =
        tabs.value[Math.min(index, tabs.value.length - 1)]?.id;
    }
  };

  const setEndpoint = (tab: WsdlTab, entry: WsdlEntry, endpoint: string) => {
    entry.endpoint = endpoint;
    entry.request = buildSoapRequest(
      tab.baseRequest,
      endpoint,
      entry.soapAction,
      entry.envelope,
    );
  };

  const select = (tab: WsdlTab, entryId: string) => {
    tab.selectedId = entryId;
  };

  const setConnectionMode = (tab: WsdlTab, mode: ConnectionMode) => {
    tab.connectionMode = mode;
  };

  return {
    tabs,
    activeTabId,
    activeTab,
    addTab,
    closeTab,
    setEndpoint,
    select,
    setConnectionMode,
  };
}
