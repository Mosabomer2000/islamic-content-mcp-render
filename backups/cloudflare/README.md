# Mosab Remote MCP — Cloudflare archive (2026-11-14)

This is a source-only backup branch. The repository's default branch remains unchanged.

## Deployments

| Worker | Source | Production URL | Version |
| --- | --- | --- | --- |
| Parallel research MCP | `mosab-mcp-parallel.worker.js` | https://mosab-mcp-parallel.mosabomer2015.workers.dev/mcp | 1.2.0 |
| MCP fixed-origin edge gateway | `mosab-mcp-edge-gateway.worker.js` | https://mosab-mcp-edge-gateway.mosabomer2015.workers.dev/mcp | 1.2.0 |

## Verification

- Parallel MCP: `GET https://mosab-mcp-parallel.mosabomer2015.workers.dev/health`.
- Parallel MCP: `GET https://mosab-mcp-parallel.mosabomer2015.workers.dev/smoke?test=calls` and `test=search`, `test=native`.
- Discovery: `GET https://mosab-mcp-parallel.mosabomer2015.workers.dev/.well-known/mcp.json`.
- Central fleet check: `GET https://pdsxlmrfmbdhobcgujje.supabase.co/functions/v1/mcp-validator-v9?mode=audit&target=cloudflare-parallel`.

## Security and limitations

All proxy targets are fixed. The parallel MCP is restricted to a read-only allowlist, at most four calls per request, concurrency three, request body 16 KB, and upstream timeout at most 12 s.

The Cloudflare gateway does not make the research system independent from Supabase. The parallel version is a **restricted compatibility subset**, not a byte-for-byte replacement of the retired Railway service. It does not implement WordCraft, NotebookLM, Saffaf, or all scholarly text validation.

Neither source file contains authentication secrets or private account data. This backup branch is in a **public** GitHub repository; do not commit access tokens, service-role keys, provider cookies, or private records here.

## Restore

Use a Cloudflare Workers **module** script with entry point `worker.js`, compatibility date `2026-11-01`, and workers.dev subdomain enabled. Do not overwrite a production deployment until the new script passes schema and functional smoke tests.
