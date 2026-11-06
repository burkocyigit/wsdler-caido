<script setup lang="ts">
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import InputText from "primevue/inputtext";

import { useHeadersStore } from "@/stores/headers";

const { headers, add, remove } = useHeadersStore();

const onPaste = (event: ClipboardEvent, id: string) => {
  const text = event.clipboardData?.getData("text") ?? "";
  const colon = text.indexOf(":");
  const header = headers.value.find((h) => h.id === id);
  if (
    colon <= 0 ||
    header === undefined ||
    header.name !== "" ||
    text.includes("\n")
  ) {
    return;
  }
  event.preventDefault();
  header.name = text.substring(0, colon).trim();
  header.value = text.substring(colon + 1).trim();
};
</script>

<template>
  <div class="flex flex-col gap-1 p-2 rounded border border-surface-700">
    <div class="flex items-center gap-2">
      <span class="text-sm font-semibold whitespace-nowrap"
        >Custom headers</span
      >
      <div class="flex-1" />
      <Button
        label="Add header"
        icon="fas fa-plus"
        size="small"
        severity="secondary"
        class="shrink-0 whitespace-nowrap"
        @click="add()"
      />
    </div>
    <div class="text-xs text-surface-400">
      Enabled headers are added to every generated request and to WSDL/XSD
      fetches. Tip: paste <code>Name: value</code> into an empty name field.
    </div>
    <div v-if="headers.length === 0" class="text-sm text-surface-400 py-1">
      No custom headers yet.
    </div>
    <div
      v-for="header in headers"
      :key="header.id"
      class="flex items-center gap-2"
    >
      <Checkbox v-model="header.enabled" binary />
      <InputText
        v-model="header.name"
        placeholder="Header name (e.g. client_secret)"
        size="small"
        class="w-64"
        :class="{ 'opacity-50': !header.enabled }"
        @paste="onPaste($event, header.id)"
      />
      <InputText
        v-model="header.value"
        placeholder="Value"
        size="small"
        class="flex-1"
        :class="{ 'opacity-50': !header.enabled }"
      />
      <Button
        icon="fas fa-trash"
        size="small"
        severity="danger"
        text
        aria-label="Remove header"
        @click="remove(header.id)"
      />
    </div>
  </div>
</template>
