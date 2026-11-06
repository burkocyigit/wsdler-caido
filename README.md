# Wsdler for Caido

A Caido port of NetSPI's Wsdler Burp extension (https://github.com/NetSPI/Wsdler).

## Installation

Install **Wsdler** from Caido's **Plugins → Community Store**, or download `plugin_package.zip` from the [latest release](https://github.com/burkocyigit/wsdler-caido/releases/latest) and use **Plugins → Install Package**.

## Usage

1. Right-click a WSDL request (for example `Service.asmx?WSDL`) in HTTP History, Replay, Search or Sitemap and select **Parse WSDL**.
2. The **Wsdler** page in the sidebar gets a new tab named after the service. It lists every SOAP operation with its **Operation**, **Binding** and **Endpoint**.
3. Click a row to see the generated SOAP request. You can edit it, then use **Send to Replay** or **Send to Automate**, or right-click the row for more actions.

You can also load a WSDL from disk with **Import WSDL file**. If the WSDL references local XSD files, select them together with the WSDL.

## Behaviour carried over from Wsdler

- The WSDL is fetched again from its URL with the original request's headers (cookies, auth). Imported WSDLs and XSDs (`wsdl:import`, `xs:import`, `xs:include`, `xs:redefine`) are fetched the same way.
- One row is created for each operation of each SOAP 1.1 or SOAP 1.2 binding. HTTP GET/POST bindings are skipped.
- Sample bodies follow soapUI's generator, as Wsdler does: `<!--type: …-->`, `<!--Optional:-->`, `<!--Zero or more repetitions:-->` and CHOICE comments, sample values from the same seeded word list, `xsi:type` for rpc/encoded, and SOAP headers.
- The request keeps the original request's headers. The request line becomes `POST <endpoint path>`, and `SOAPAction`, `Content-Type: text/xml;charset=UTF-8` and `Host` are set.
- Every parse opens a new closable tab.

## Additions

- **Custom headers**: add headers such as `client_secret: …` and switch each one on or off with its checkbox. Enabled headers are added to every generated request and to WSDL/XSD fetches. The list is saved in Caido.
- **Import WSDL file**: parse a local WSDL (for example a WCF `?singleWsdl` export) without a request in Caido.
- **Editable Endpoint**: requests are sent to the host in the Endpoint cell. Change it to point at another host; when a binding has several addresses, pick one from the list.
- **Send all to Replay** creates a Replay collection holding every operation.
- The sidebar shows a counter for newly parsed WSDLs. In Burp, the tab flashed orange instead.

## Network requests and data

- Wsdler contacts only the hosts you point it at: the WSDL URL of the request you parse, and the documents that WSDL imports (`wsdl:import`, `xs:import`, `xs:include`, `xs:redefine`). These requests go through Caido's own HTTP client.
- Requests are sent to Replay or Automate only when you click those actions.
- No telemetry, analytics, ads, external services or auto-update mechanism.
- Custom headers (which may hold secrets such as `client_secret`) are stored only in Caido's local plugin storage. They are sent only in requests to the targets you parse or send.

## Build

```bash
pnpm install
pnpm build
```

Install `dist/plugin_package.zip` in Caido under **Plugins → Install Package**.

## License

MIT. See [LICENSE](LICENSE).

## Credits

- [Wsdler](https://github.com/NetSPI/Wsdler) by NetSPI, the Burp Suite extension this plugin ports to Caido.
- The SOAP sample-message generator is a TypeScript re-implementation of `SampleXmlUtil` / `SoapMessageBuilder` from [reficio soap-ws](https://github.com/reficio/soap-ws), which derive from soapUI and [Apache XmlBeans](https://xmlbeans.apache.org/). Those projects are licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). See [NOTICE](NOTICE).
