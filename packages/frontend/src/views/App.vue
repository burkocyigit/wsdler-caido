<script setup lang="ts">
import Button from "primevue/button";
import { computed, ref } from "vue";

import { HeadersPanel } from "@/components/HeadersPanel";
import { WsdlTabView } from "@/components/WsdlTabView";
import { useSDK } from "@/plugins/sdk";
import { parseWsdlFiles } from "@/services/parse";
import { useHeadersStore } from "@/stores/headers";
import { useWsdlerStore } from "@/stores/wsdler";

const sdk = useSDK();
const store = useWsdlerStore();
const { tabs, activeTabId } = store;
const { activeHeaders } = useHeadersStore();

const showHeaders = ref(false);
const headersLabel = computed(() =>
  activeHeaders.value.length > 0
    ? `Custom headers (${activeHeaders.value.length})`
    : "Custom headers",
);

const fileInput = ref<HTMLInputElement>();
const importing = ref(false);

const onFilesSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const selected = Array.from(input.files ?? []);
  input.value = "";
  if (selected.length === 0) {
    return;
  }
  importing.value = true;
  try {
    const files = await Promise.all(
      selected.map(async (f) => ({ name: f.name, text: await f.text() })),
    );
    const outcomes = await parseWsdlFiles(sdk, files);
    for (const outcome of outcomes) {
      if (outcome.kind === "Error") {
        sdk.window.showToast(`Wsdler: ${outcome.error}`, {
          variant: "error",
          duration: 10000,
        });
      } else {
        sdk.window.showToast(
          `Wsdler: parsed ${outcome.operations} operations from ${outcome.tabName}`,
          { variant: "success" },
        );
      }
    }
  } finally {
    importing.value = false;
  }
};
</script>

<template>
  <div class="h-full flex flex-col min-h-0 p-1 gap-1">
    <div class="flex items-center gap-2 shrink-0">
      <div
        v-if="tabs.length > 0"
        class="flex gap-1 overflow-x-auto flex-1 min-w-0"
      >
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="flex items-center gap-2 px-3 py-1 rounded-t cursor-pointer select-none text-sm"
          :class="
            tab.id === activeTabId
              ? 'bg-surface-700 text-surface-0'
              : 'text-surface-300 hover:bg-surface-800'
          "
          @click="activeTabId = tab.id"
          @auxclick.middle="store.closeTab(tab.id)"
        >
          <span>{{ tab.name }}</span>
          <i
            class="fas fa-xmark text-xs opacity-60 hover:opacity-100"
            title="Close tab"
            @click.stop="store.closeTab(tab.id)"
          />
        </div>
      </div>
      <div v-else class="flex-1" />
      <Button
        :label="headersLabel"
        icon="fas fa-heading"
        size="small"
        :severity="showHeaders ? undefined : 'secondary'"
        @click="showHeaders = !showHeaders"
      />
      <Button
        label="Import WSDL file"
        icon="fas fa-file-import"
        size="small"
        severity="secondary"
        :loading="importing"
        @click="fileInput?.click()"
      />
      <input
        ref="fileInput"
        type="file"
        accept=".wsdl,.xml,.xsd,.svc,text/xml,application/xml"
        multiple
        class="hidden"
        @change="onFilesSelected"
      />
    </div>
    <HeadersPanel v-if="showHeaders" class="shrink-0" />
    <div
      v-if="tabs.length === 0"
      class="flex-1 flex items-center justify-center"
    >
      <div class="text-center text-surface-400 flex flex-col gap-2">
        <i class="fas fa-file-code text-4xl" />
        <div class="text-lg">No WSDL parsed yet</div>
        <div class="text-sm">
          Right-click a WSDL request (e.g. <code>?wsdl</code>) and select
          <b>Parse WSDL</b>, or use <b>Import WSDL file</b> to load a local WSDL
          (select its XSD files too if it references them).
        </div>
      </div>
    </div>
    <div
      v-for="tab in tabs"
      v-show="tab.id === activeTabId"
      :key="tab.id"
      class="flex-1 min-h-0"
    >
      <WsdlTabView :tab="tab" />
    </div>
  </div>
</template>
