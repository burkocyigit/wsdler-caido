<script setup lang="ts">
import { type EditorView } from "@codemirror/view";
import Button from "primevue/button";
import Column from "primevue/column";
import ContextMenu from "primevue/contextmenu";
import DataTable from "primevue/datatable";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import Splitter from "primevue/splitter";
import SplitterPanel from "primevue/splitterpanel";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { Icons } from "@/icons";
import { useSDK } from "@/plugins/sdk";
import { sendAllToReplay, sendToAutomate, sendToReplay } from "@/services/send";
import { useHeadersStore } from "@/stores/headers";
import { useWsdlerStore, type WsdlEntry, type WsdlTab } from "@/stores/wsdler";

const { tab } = defineProps<{ tab: WsdlTab }>();

const sdk = useSDK();
const store = useWsdlerStore();

const editorHost = ref<HTMLDivElement>();
let view: EditorView | undefined;
let displayedId: string | undefined;
let resizeObserver: ResizeObserver | undefined;

const selected = computed({
  get: () => tab.entries.find((e) => e.id === tab.selectedId),
  set: (entry: WsdlEntry | undefined) => {
    if (entry !== undefined) {
      store.select(tab, entry.id);
    }
  },
});

const editorText = () => view?.state.doc.toString() ?? "";

const setEditorText = (text: string) => {
  if (view === undefined || view.state.doc.toString() === text) {
    return;
  }
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
  });
};

const saveEditor = () => {
  const previous = tab.entries.find((e) => e.id === displayedId);
  if (previous !== undefined && view !== undefined) {
    previous.request = editorText();
  }
};

const showEntry = (entry: WsdlEntry | undefined) => {
  saveEditor();
  displayedId = entry?.id;
  setEditorText(entry?.request ?? "");
};

const mountEditor = () => {
  const host = editorHost.value;
  if (host === undefined || !host.isConnected) {
    return;
  }
  saveEditor();
  host.replaceChildren();
  const editor = sdk.ui.httpRequestEditor();
  host.appendChild(editor.getElement());
  view = editor.getEditorView();
  displayedId = selected.value?.id;
  setEditorText(selected.value?.request ?? "");
};

const SAVE_EVENTS = ["input", "keyup", "paste", "cut", "drop", "focusout"];

let hostVisible = false;

const onHostResize = () => {
  const host = editorHost.value;
  const visible =
    host !== undefined &&
    host.isConnected &&
    host.getBoundingClientRect().height > 0;
  if (visible && !hostVisible) {
    mountEditor();
  } else if (!visible && hostVisible) {
    saveEditor();
  } else if (visible) {
    view?.requestMeasure();
  }
  hostVisible = visible;
};

onMounted(() => {
  const host = editorHost.value;
  if (host === undefined) {
    return;
  }
  for (const name of SAVE_EVENTS) {
    host.addEventListener(name, saveEditor);
  }
  resizeObserver = new ResizeObserver(onHostResize);
  resizeObserver.observe(host);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  saveEditor();
  view = undefined;
});

watch(
  () => tab.selectedId,
  () => showEntry(selected.value),
);

const headerStore = useHeadersStore();
const headerSnapshot = computed(() => ({
  names: headerStore.allNames.value,
  active: headerStore.activeHeaders.value,
}));

watch(headerSnapshot, (next, previous) => {
  saveEditor();
  store.applyHeaderChange(tab, [...previous.names, ...next.names], next.active);
  setEditorText(selected.value?.request ?? "");
});

const rawFor = (entry: WsdlEntry) =>
  entry.id === displayedId ? editorText() : entry.request;

const onEndpointChange = (entry: WsdlEntry, endpoint: string) => {
  store.setEndpoint(tab, entry, endpoint);
  if (entry.id === displayedId) {
    setEditorText(entry.request);
  }
};

const resetRequest = (entry: WsdlEntry) => {
  store.setEndpoint(tab, entry, entry.endpoint);
  if (entry.id === displayedId) {
    setEditorText(entry.request);
  }
};

const run = async (action: () => Promise<void>, success: string) => {
  try {
    await action();
    sdk.window.showToast(success, { variant: "success" });
  } catch (e) {
    sdk.window.showToast(e instanceof Error ? e.message : String(e), {
      variant: "error",
    });
  }
};

const replay = (entry: WsdlEntry) =>
  run(async () => {
    await sendToReplay(sdk, tab, entry, rawFor(entry));
  }, `Sent ${entry.operationName} to Replay`);

const automate = (entry: WsdlEntry) =>
  run(
    () => sendToAutomate(sdk, tab, entry, rawFor(entry)),
    `Sent ${entry.operationName} to Automate`,
  );

const replayAll = () =>
  run(async () => {
    saveEditor();
    await sendAllToReplay(sdk, tab, rawFor);
  }, `Sent ${tab.entries.length} requests to Replay collection "Wsdler - ${tab.name}"`);

const copy = (entry: WsdlEntry) =>
  run(
    () => navigator.clipboard.writeText(rawFor(entry)),
    "Request copied to clipboard",
  );

const menu = ref<InstanceType<typeof ContextMenu>>();
const menuEntry = ref<WsdlEntry>();
const menuItems = computed(() => {
  const entry = menuEntry.value;
  if (entry === undefined) {
    return [];
  }
  return [
    {
      label: "Send to Replay",
      icon: Icons.replay,
      command: () => replay(entry),
    },
    {
      label: "Send to Automate",
      icon: Icons.automate,
      command: () => automate(entry),
    },
    { label: "Copy request", icon: "fas fa-copy", command: () => copy(entry) },
    {
      label: "Reset request",
      icon: "fas fa-arrow-rotate-left",
      command: () => resetRequest(entry),
    },
  ];
});

const onRowContextMenu = (event: { originalEvent: Event; data: WsdlEntry }) => {
  menuEntry.value = event.data;
  menu.value?.show(event.originalEvent);
};

const onEndpointInput = (entry: WsdlEntry, event: Event) => {
  const value = (event.target as HTMLInputElement).value.trim();
  if (value !== entry.endpoint) {
    onEndpointChange(entry, value);
  }
};
</script>

<template>
  <div class="h-full flex flex-col gap-1 min-h-0">
    <div class="flex items-center gap-2 flex-wrap px-1">
      <span
        class="text-sm text-surface-400 truncate max-w-[40%]"
        :title="tab.url"
        >{{ tab.url }}</span
      >
      <span class="text-sm text-surface-400"
        >· {{ tab.entries.length }} operations</span
      >
      <span
        v-if="tab.warnings.length > 0"
        class="text-sm text-yellow-500 cursor-help"
        :title="tab.warnings.join('\n')"
      >
        <i class="fas fa-triangle-exclamation" />
        {{ tab.warnings.length }} warning(s)
      </span>
      <div class="flex-1" />
      <Button
        label="Send to Replay"
        :icon="Icons.replay"
        size="small"
        :disabled="selected === undefined"
        @click="selected && replay(selected)"
      />
      <Button
        label="Send to Automate"
        :icon="Icons.automate"
        size="small"
        severity="secondary"
        :disabled="selected === undefined"
        @click="selected && automate(selected)"
      />
      <Button
        label="Send all to Replay"
        icon="fas fa-layer-group"
        size="small"
        severity="secondary"
        @click="replayAll"
      />
    </div>
    <Splitter layout="vertical" class="flex-1 min-h-0">
      <SplitterPanel :size="30" :min-size="10" class="min-h-0">
        <DataTable
          v-model:selection="selected"
          :value="tab.entries"
          data-key="id"
          selection-mode="single"
          :meta-key-selection="false"
          context-menu
          scrollable
          scroll-height="flex"
          sort-mode="single"
          size="small"
          class="h-full"
          @row-contextmenu="onRowContextMenu"
        >
          <Column field="operationName" header="Operation" sortable />
          <Column field="bindingName" header="Binding" sortable />
          <Column field="endpoint" header="Endpoint" sortable>
            <template #body="{ data }">
              <Select
                v-if="data.endpoints.length > 1"
                :model-value="data.endpoint"
                :options="data.endpoints"
                editable
                size="small"
                class="w-full"
                @update:model-value="onEndpointChange(data, $event)"
                @click.stop
              />
              <InputText
                v-else
                :model-value="data.endpoint"
                placeholder="http://host/path"
                size="small"
                class="w-full"
                @change="onEndpointInput(data, $event)"
                @keydown.enter="onEndpointInput(data, $event)"
                @click.stop
              />
            </template>
          </Column>
        </DataTable>
        <ContextMenu ref="menu" :model="menuItems" />
      </SplitterPanel>
      <SplitterPanel :size="70" :min-size="20" class="min-h-0 flex flex-col">
        <div class="px-2 py-1 text-sm font-semibold">Request</div>
        <div
          ref="editorHost"
          class="flex-1 min-h-0 flex flex-col overflow-hidden [&>*]:flex-1 [&>*]:min-h-0 [&>*]:overflow-hidden"
        />
      </SplitterPanel>
    </Splitter>
  </div>
</template>
