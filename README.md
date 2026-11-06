# Wsdler for Caido

A Caido port of NetSPI's Wsdler Burp extension (https://github.com/NetSPI/Wsdler).

## Installation

Install **Wsdler** from Caido's **Plugins → Community Store**, or download `plugin_package.zip` from the [latest release](https://github.com/burkocyigit/wsdler-caido/releases/latest) and use **Plugins → Install Package**.

## Usage

1. Right-click a WSDL request (for example `Service.asmx?WSDL`) in HTTP History, Replay, Search or Sitemap and select **Parse WSDL**.
2. The **Wsdler** page in the sidebar gets a new tab named after the service. It lists every SOAP operation with its **Operation**, **Binding** and **Endpoint**.
3. Click a row to see the generated SOAP request. You can edit it, then use **Send to Replay** or **Send to Automate**, or right-click the row for more actions.

## Behaviour carried over from Wsdler

- The WSDL is fetched again from its URL with the original request's headers (cookies, auth). Imported WSDLs and XSDs (`wsdl:import`, `xs:import`, `xs:include`, `xs:redefine`) are fetched the same way.
- One row is created for each operation of each SOAP 1.1 or SOAP 1.2 binding. HTTP GET/POST bindings are skipped.
- Sample bodies follow soapUI's generator, as Wsdler does: `<!--type: …-->`, `<!--Optional:-->`, `<!--Zero or more repetitions:-->` and CHOICE comments, sample values from the same seeded word list, `xsi:type` for rpc/encoded, and SOAP headers.
- The request keeps the original request's headers. The request line becomes `POST <endpoint path>`, and `SOAPAction`, `Content-Type: text/xml;charset=UTF-8` and `Host` are set.
- Every parse opens a new closable tab.

## Additions

- **Connect to**: chooses where requests are sent. *Original request host* is the default and matches Burp. *WSDL endpoint host* sends to the `soap:address` host.
- An Endpoint dropdown appears when a binding has more than one address.
- **Send all to Replay** creates a Replay collection holding every operation.
- The sidebar shows a counter for newly parsed WSDLs. In Burp, the tab flashed orange instead.

## Build

```bash
pnpm install
pnpm build
```

Install `dist/plugin_package.zip` in Caido under **Plugins → Install Package**.

## License

MIT. See [NOTICE](NOTICE) for third-party attributions.
