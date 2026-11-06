<script setup lang="ts">
import { WsdlTabView } from "@/components/WsdlTabView";
import { useWsdlerStore } from "@/stores/wsdler";

const store = useWsdlerStore();
const { tabs, activeTabId } = store;
</script>

<template>
  <div class="h-full flex flex-col min-h-0 p-1 gap-1">
    <div
      v-if="tabs.length > 0"
      class="flex gap-1 overflow-x-auto border-b border-surface-700 shrink-0"
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
    <div
      v-if="tabs.length === 0"
      class="flex-1 flex items-center justify-center"
    >
      <div class="text-center text-surface-400 flex flex-col gap-2">
        <i class="fas fa-file-code text-4xl" />
        <div class="text-lg">No WSDL parsed yet</div>
        <div class="text-sm">
          Right-click a WSDL request (e.g. <code>?wsdl</code>) and select
          <b>Parse WSDL</b>.
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
