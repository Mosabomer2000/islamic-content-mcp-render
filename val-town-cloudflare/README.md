# Val Town → Cloudflare migration register

Snapshot: **2026-11-14**, based on live reads of Val Town, Cloudflare, and GitHub. This branch is an isolated migration-backup branch, **not** a production deployment branch.

## Migration safeguards

- Preserve the original Val Town project and URL until parity, dependencies, schedules, and rollback are verified.
- Never copy secret values into Git. Save source files only after checking they contain no hardcoded secrets.
- No paid resources may be activated automatically.
- A matching row count is only a preliminary integrity check, not a proof of identical data or ongoing synchronization.
- Do not cut over write-capable services while the Cloudflare implementation is read-only.
- Keep PostgreSQL-heavy Islamic Research OS state on Supabase for now.

## Verified milestones

| Project / service | State | Evidence |
| --- | --- | --- |
| bahith-mcp-smoke-20261017 | **Ported + tested** | Cloudflare Worker `mosab-bahith-mcp-smoke`; GET status 200; initialize, tools/list, ping, echo, and invalid tool cases pass |
| bahith-public-mcp-gateway | **Existing Cloudflare equivalent tested** | `mosab-bahith-turath-fallback`; initialize, tools/list (3 tools), invalid tool handling pass; no live upstream search assertion |
| midad-transcripts | **Read-only preview ported + tested** | Cloudflare Worker `mosab-midad-readonly-preview` on existing D1; GET stats and exact-phrase search match original; import POST rejected HTTP 405; full write/curation and original UI not migrated |
| Cloudflare test harness | **Active** | `mosab-smoke-cutover-probe`; internal Service Bindings to Smoke, Turath fallback, Midad; all checks passing as of snapshot |

Cloudflare URLs:
- https://mosab-bahith-mcp-smoke.mosabomer2015.workers.dev/
- https://mosab-bahith-turath-fallback.mosabomer2015.workers.dev/
- https://mosab-midad-readonly-preview.mosabomer2015.workers.dev/
- https://mosab-smoke-cutover-probe.mosabomer2015.workers.dev/

## Val Town inventory

| Project | Present state / dependency | Priority |
| --- | --- | --- |
| `midad-transcripts` | D1 copied; read-only API preview; source write endpoints and UI still on Val Town | High: full endpoint parity and syncing |
| `bahith-bulk-domain-research` | **Read-only Cloudflare UI and JSON/CSV export tested** (`mosab-bulk-readonly-preview`); statistics and filtered rows match Val Town. Original hourly/15min jobs remain on Val Town. | High: safe scheduled-job cutover |
| `mawsuat-adillat-sihhat-al-islam` | Val Town contains the unmodified basic HTML starter (`Hi there!`), template CSS/JS, not an actual encyclopedia. Publishing this as the encyclopedia would be misleading. | Blocked: locate actual project content first |
| `research-execution-gateway` | D1 quota rows 5; complex MCP source with npm dependencies and audit modules; no completed Worker port | High |
| `bahith-quranonlinelibrary-adapter` | HTML parsing (Cheerio); no completed Worker port | Medium |
| `musannif-personal-critical-guard` | MCP SDK/Zod dependencies; no completed Worker port | Medium |
| `bahith-mcp-smoke-20261017` | Successfully ported and tested | Complete pilot |
| `bahith-fasi-image-verifier` | Single diagnostic script; not an HTTP app; evaluate archival rather than production migration | Low |
| `bahith-aleman-native-mcp` | **Cloudflare read-only MCP preview tested** (`mosab-aleman-readonly-preview`): status/search/cached-section tools pass; sync intentionally disabled. Original 6-hour sync on Val Town unchanged. | High: remaining MCP tools + sync migration |
| `bahith-public-mcp-gateway` | Equivalent public Turath fallback Worker exists and protocol checks pass | Upstream verification / cutover pending |
| `bahith-federated-public-mcp` | D1 gateway quota 4 rows copied; upstream federation and quota enforcement not yet ported | Medium |

## Read-only source backups

- `bahith-mcp-smoke/original-main.ts`: original Val Town code
- `bahith-mcp-smoke/worker.js`: verified Cloudflare port
- `midad-transcripts/original-main.ts`: original Val Town API code
- `midad-transcripts/worker-readonly.js`: tested D1-backed read-only Cloudflare API

## Remaining acceptance gates

1. Verify table-level record fingerprints and indexes, not only counts; check divergence after Val Town scheduled updates.
2. Port scheduled jobs with idempotency, retry handling, safe secrets and bounded source fetches.
3. Reproduce full MCP `tools/call` behavior against the original and migrated services; test not only `tools/list`.
4. Port UI assets and all write/curation endpoints only with least-privilege authentication and non-destructive safeguards.
5. Confirm linked client endpoints, server health, logs, backup recovery, and rollback.
6. Only then consider redirecting Val Town URLs or discontinuing the old host.

Cloudflare D1 databases already present: `mosab-bahith-federated`, `mosab-research-execution`, `mosab-bahith-aleman`, `mosab-bahith-bulk`, `mosab-midad-transcripts`.

**Unchanged platforms:** Supabase `mosab-mcp-hub`, all Railway projects, and original Val Town projects. Connected Vercel currently lists no projects; account scope must be rechecked before any claimed Vercel migration.


## Phase 2 — verified 2026-11-14

- **8 database tables** matched between Val Town and Cloudflare D1 on row count **and** summed character lengths for selected core columns: Midad (segments, videos, segment_editions), bulk research (jobs, pages, native_articles), Al-Eman (books, sections). These are aggregate parity checks, not cryptographic row-by-row verification.
- **Al-Eman read-only MCP port**: https://mosab-aleman-readonly-preview.mosabomer2015.workers.dev/ . Protocol initialize, three-tool list, status (424 books, 299 indexed sections), search (matched book IDs 180 and 575), cached text read (book 606, section 940264; 15,543 characters), and disabled sync all passed. No original catalog writer was switched off.
- **Bulk domain research read-only web port**: https://mosab-bulk-readonly-preview.mosabomer2015.workers.dev/ . HTML, CSV and JSON GET passed; JSON stats and all 3 filtered rows for 'نزع البركة' exactly matched Val Town. POST returns 405. Original schedulers remain active only on Val Town.
- **QA suite** extended: https://mosab-smoke-cutover-probe.mosabomer2015.workers.dev/ returned `pass:true` for smoke MCP, Turath fallback protocol, Midad preview, Al-Eman preview, and bulk research preview. This only establishes checked behavior, not full program parity.
- Additional GitHub sources stored at `bahith-aleman-native-mcp/original-aleman.ts`, `bahith-aleman-native-mcp/worker-readonly.js`, `bahith-bulk-domain-research/original-*.ts`, `bahith-bulk-domain-research/worker-readonly.js`, and `qa/worker-v2.js`.
- **No production URL redirects, no cron cutovers, no paid services, no Supabase/Railway modifications** during phase 2.
