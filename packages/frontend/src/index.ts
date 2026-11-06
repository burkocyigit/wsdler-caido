import { Classic } from "@caido/primevue";
import PrimeVue from "primevue/config";
import type { ParseSource } from "shared";
import { createApp } from "vue";

import { SDKPlugin } from "./plugins/sdk";
import { parseWsdl } from "./services/parse";
import "./styles/index.css";
import type { FrontendSDK } from "./types";
import App from "./views/App.vue";

const PAGE = "/wsdler";
const PARSE_COMMAND = "wsdler.parse-wsdl";

type Context = Parameters<
  Parameters<FrontendSDK["commands"]["register"]>[1]["run"]
>[0];

function sourceFromContext(context: Context): ParseSource | undefined {
  switch (context.type) {
    case "RequestRowContext": {
      const request = context.requests[0];
      return request === undefined ? undefined : { kind: "id", id: request.id };
    }
    case "RequestContext": {
      const request = context.request;
      if (request.type === "RequestFull") {
        return { kind: "id", id: request.id };
      }
      return {
        kind: "raw",
        raw: request.raw,
        target: {
          host: request.host,
          port: request.port,
          isTls: request.isTls,
        },
      };
    }
    case "ResponseContext":
      return { kind: "id", id: context.request.id };
    default:
      return undefined;
  }
}

export const init = (sdk: FrontendSDK) => {
  const app = createApp(App);
  app.use(PrimeVue, { unstyled: true, pt: Classic });
  app.use(SDKPlugin, sdk);

  const root = document.createElement("div");
  Object.assign(root.style, { height: "100%", width: "100%" });
  root.id = `plugin--wsdler`;
  app.mount(root);

  let unseen = 0;
  let onPage = false;

  const sidebarItem = sdk.sidebar.registerItem("Wsdler", PAGE, {
    icon: "fas fa-file-code",
  });

  sdk.navigation.addPage(PAGE, {
    body: root,
    onEnter: () => {
      unseen = 0;
      sidebarItem.setCount(0);
    },
  });

  sdk.navigation.onPageChange((event) => {
    onPage = event.type === "Plugin" && event.path === PAGE;
  });

  sdk.commands.register(PARSE_COMMAND, {
    name: "Parse WSDL",
    group: "Wsdler",
    when: (context) => sourceFromContext(context) !== undefined,
    run: async (context) => {
      const source = sourceFromContext(context);
      if (source === undefined) {
        sdk.window.showToast("Select a request containing a WSDL first", {
          variant: "warning",
        });
        return;
      }
      sdk.window.showToast("Parsing WSDL...", {
        variant: "info",
        duration: 2000,
      });
      const outcome = await parseWsdl(sdk, source);
      if (outcome.kind === "Error") {
        sdk.window.showToast(`Wsdler: ${outcome.error}`, {
          variant: "error",
          duration: 10000,
        });
        return;
      }
      if (!onPage) {
        unseen++;
        sidebarItem.setCount(unseen);
      }
      sdk.window.showToast(
        `Wsdler: parsed ${outcome.operations} operations from ${outcome.tabName}`,
        {
          variant: "success",
        },
      );
    },
  });

  sdk.menu.registerItem({
    type: "RequestRow",
    commandId: PARSE_COMMAND,
    leadingIcon: "fas fa-file-code",
  });
  sdk.menu.registerItem({
    type: "Request",
    commandId: PARSE_COMMAND,
    leadingIcon: "fas fa-file-code",
  });
  sdk.menu.registerItem({
    type: "Response",
    commandId: PARSE_COMMAND,
    leadingIcon: "fas fa-file-code",
  });
};
