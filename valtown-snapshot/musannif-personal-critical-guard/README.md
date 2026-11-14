# MCP server

_In video form:
[How to build an MCP server in 1 minute](https://youtu.be/sO6-Wl5fy7g?si=oc7s9bVIVFHxHJh2)_

A minimal MCP server with one example tool (that gets the current time in a
given timezone).

Remix this val to create your own MCP server on Val
Town—[**_just like the MCP Core Maintainer team!_**](https://blog.val.town/mcp-core-maintainers)

This MCP server (<50 LOC in [`main.ts`](./main.ts)) is live on
[mcp-time.val.run](https://mcp-time.val.run) if you'd like to test it
([playground.ai.cloudflare.com](https://playground.ai.cloudflare.com) is a great
place to test an MCP server quickly). It's built on the v2 TypeScript SDK,
compatible with “MCP 2.0” (technically, the
[2026-07-28 spec](https://modelcontextprotocol.io/specification/2026-07-28)). It
also supports the legacy spec, for MCP clients that haven't upgraded yet.