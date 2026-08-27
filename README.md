# Islamic Content MCP — Remote HTTP Deployment

This repository deploys the official [Islamic Content MCP](https://github.com/2yousefreda/islamic-content-mcp) server as a **Streamable HTTP** service on Render. The MCP implementation is the built JavaScript output of the upstream project's documented stdio entry point, `node dist/bin.js`; this deployment runs that same entry point as `node bin.js` through Supergateway.

| Endpoint | Purpose |
| --- | --- |
| `/mcp` | Stateful Streamable HTTP MCP endpoint |
| `/healthz` | Returns `ok` for deployment health checks |

The deployment command is:

```bash
supergateway --stdio 'node bin.js' --outputTransport streamableHttp --stateful --sessionTimeout 60000 --port ${PORT:-10000} --streamableHttpPath /mcp --healthEndpoint /healthz --logLevel info
```

The upstream server exposes Quran, Hadith, IslamHouse, Al-Montaka, Bayan Al-Islam, and Risalat Al-Haramain tooling. The service runs on the Render `free` plan declared in `render.yaml`.
