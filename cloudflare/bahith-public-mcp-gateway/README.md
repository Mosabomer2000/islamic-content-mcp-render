# Bahith Turath Public MCP Gateway — Cloudflare Worker

Prepared from the public Val Town source; **not yet deployed or tested on Cloudflare**.

## Local and remote deployment

```sh
npm install
npm run dev
npm run deploy
```

Run from this directory after authenticating Wrangler with your own Cloudflare account. Do not commit API tokens. Verify GET and MCP initialize/tools/list/tools/call before switching a client URL. The Worker keeps the original public read-only upstream proxy behavior. Existing Val Town endpoints must remain unchanged until tested.
